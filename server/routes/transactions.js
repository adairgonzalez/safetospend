const express = require('express');
const router = express.Router();
const plaidClient = require('../plaidClient');
const db = require('../db');
const { isTransfer, detectPaycheck } = require('../paycheck');

async function getTxns(accessToken, start, end) {
  const res = await plaidClient.transactionsGet({
    access_token: accessToken, start_date: start, end_date: end,
    options: { count: 500, offset: 0 },
  });
  return res.data.transactions;
}

router.get('/safe-to-spend', async (req, res) => {
  const user = db.prepare('SELECT plaid_access_token FROM users WHERE id=?').get(req.user.userId);
  if (!user?.plaid_access_token) return res.json({ error: 'No bank', noBank: true });
  const accessToken = user.plaid_access_token;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth()-2, 1).toISOString().slice(0,10);
  const end = now.toISOString().slice(0,10);
  let txns;
  try { txns = await getTxns(accessToken, start, end); } catch (e) {
    const p = e.response?.data;
    console.error('transactionsGet failed:', p || e.message);
    if (p?.error_code === 'PRODUCT_NOT_READY') {
      return res.json({ error: 'Plaid is still importing your transactions (first sync takes a minute or two). Hit refresh shortly.', retryable: true });
    }
    return res.status(500).json({ error: p?.error_message || e.message, error_code: p?.error_code });
  }

  const paycheck = detectPaycheck(txns);
  if (!paycheck) return res.json({ error: 'No paycheck found yet', retryable: true });
  const hasPinnedAccount = process.env.PAYCHECK_ACCOUNT_ID && process.env.PAYCHECK_ACCOUNT_ID !== 'placeholder';
  const payAmt = -paycheck.amount, payDate = paycheck.date;
  const template = db.prepare('SELECT * FROM bills_template').all();
  const allocated = template.reduce((s,r) => s + r.amount, 0);

  // A cycle that ends negative shouldn't just vanish when the next one
  // starts fresh - that overspending is still real money you're behind on.
  // Carry the previous cycle's shortfall (if any) into this cycle's budget,
  // so it stays visible until you actually make it back up. A cycle that
  // ends positive naturally stops carrying anything forward (self-clearing).
  const prevCycle = db.prepare('SELECT safe_to_spend FROM cycle_history WHERE user_id=? AND pay_date < ? ORDER BY pay_date DESC LIMIT 1')
    .get(req.user.userId, payDate);
  const carryoverDeficit = (prevCycle && prevCycle.safe_to_spend < 0) ? prevCycle.safe_to_spend : 0;

  const discBudget = payAmt - allocated + carryoverDeficit;

  // Anything that left the paycheck account since payday counts as spending,
  // except internal transfers to savings (that's the bill money, already
  // subtracted via discretionaryBudget, not discretionary spending),
  // anything flagged reimbursable (money that's coming back, so it never
  // really left the budget even though it left the account), and anything
  // matching an autopay bill (already subtracted via discretionaryBudget,
  // just like a transfer - counting it again here would double-charge the
  // same expense once via the reduced budget and again as spending).
  // Pending debits count too (safer to undercount safe-to-spend than
  // overcount it while a swipe hasn't posted yet).
  const reimbursableIds = new Set(
    db.prepare('SELECT transaction_id FROM reimbursements WHERE user_id=?').all(req.user.userId).map(r => r.transaction_id)
  );
  const autopayMatchers = template.map(r => r.match_name).filter(Boolean).map(s => s.toUpperCase());
  const isAutopayBill = (t) => autopayMatchers.some(m => (t.name || '').toUpperCase().includes(m));
  const debitsSincePayday = txns.filter(t => {
    if (hasPinnedAccount && t.account_id !== process.env.PAYCHECK_ACCOUNT_ID) return false;
    return t.date >= payDate && t.amount > 0 && !isTransfer(t) && !isAutopayBill(t);
  });
  const spending = debitsSincePayday.filter(t => !reimbursableIds.has(t.transaction_id));
  const spent = spending.reduce((s,t) => s + t.amount, 0);
  const safe = discBudget - spent;

  const reimbursements = db.prepare('SELECT transaction_id, name, amount, date, received FROM reimbursements WHERE user_id=? ORDER BY flagged_at DESC').all(req.user.userId);

  // Keeps a running record of the current cycle's numbers, updated on every
  // load. Once a new paycheck's pay_date takes over, this row simply stops
  // being touched and becomes a frozen historical snapshot - no explicit
  // "cycle ended" detection needed. Powers the Insights trend view.
  db.prepare(`INSERT INTO cycle_history (user_id, pay_date, paycheck_amount, discretionary_budget, total_spent, safe_to_spend, updated_at)
              VALUES (?,?,?,?,?,?,datetime('now'))
              ON CONFLICT(user_id, pay_date) DO UPDATE SET total_spent=excluded.total_spent, safe_to_spend=excluded.safe_to_spend, updated_at=excluded.updated_at`)
    .run(req.user.userId, payDate, payAmt, discBudget, spent, safe);

  res.json({
    safeToSpend: Math.round(safe*100)/100,
    paycheckAmount: payAmt,
    paycheckDate: payDate,
    discretionaryBudget: discBudget,
    billsAllocated: allocated,
    carryoverDeficit: Math.round(carryoverDeficit*100)/100,
    totalSpent: spent,
    nextPayday: new Date(new Date(payDate).getTime() + 14*86400000).toISOString().slice(0,10),
    checklist: template.map(r => ({
      category: r.category, amount: r.amount, autopay: !!r.match_name,
      description: r.match_name ? `Already budgeted — auto-pays from checking` : `Transfer $${r.amount} to ${r.category}`,
    })),
    spending: spending
      .sort((a,b) => new Date(b.date) - new Date(a.date))
      .map(t => ({ transaction_id: t.transaction_id, date: t.date, name: t.name, amount: t.amount, pending: !!t.pending })),
    reimbursements
  });
});

// Excludes a specific charge from spending because it'll be paid back
// (e.g. an HSA/wellness benefit reimbursement) - the money left the
// account but isn't really gone from the budget.
router.post('/flag-reimbursable', (req, res) => {
  const { transaction_id, name, amount, date } = req.body;
  if (!transaction_id || typeof amount !== 'number') return res.status(400).json({ error: 'transaction_id and amount required' });
  try {
    db.prepare('INSERT INTO reimbursements (user_id, transaction_id, name, amount, date) VALUES (?,?,?,?,?)')
      .run(req.user.userId, transaction_id, name || '', amount, date || '');
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: 'Already flagged as reimbursable' });
  }
});

router.post('/unflag-reimbursable', (req, res) => {
  const { transaction_id } = req.body;
  db.prepare('DELETE FROM reimbursements WHERE user_id=? AND transaction_id=?').run(req.user.userId, transaction_id);
  res.json({ success: true });
});

router.post('/mark-reimbursed', (req, res) => {
  const { transaction_id } = req.body;
  db.prepare("UPDATE reimbursements SET received=1, received_at=datetime('now') WHERE user_id=? AND transaction_id=?")
    .run(req.user.userId, transaction_id);
  res.json({ success: true });
});

// Temporary diagnostic: dump raw recent transactions so paycheck-detection
// mismatches (name, amount, account, date) can be seen instead of guessed at.
router.get('/debug', async (req, res) => {
  const user = db.prepare('SELECT plaid_access_token FROM users WHERE id=?').get(req.user.userId);
  if (!user?.plaid_access_token) return res.json({ error: 'No bank' });
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth()-2, 1).toISOString().slice(0,10);
  const end = now.toISOString().slice(0,10);
  try {
    const txns = await getTxns(user.plaid_access_token, start, end);
    res.json(txns
      .sort((a,b) => new Date(b.date) - new Date(a.date))
      .map(t => ({ transaction_id: t.transaction_id, date: t.date, name: t.name, amount: t.amount, account_id: t.account_id, pending: t.pending })));
  } catch (e) {
    const p = e.response?.data;
    res.status(500).json({ error: p?.error_message || e.message, error_code: p?.error_code });
  }
});

// Plaid's transactionsGet returns whatever it last synced from the bank on
// its own schedule, which can lag same-day deposits by up to a day.
// transactionsRefresh asks Plaid to fetch fresh data from Capital One now;
// new transactions typically land within 10-60 seconds after this returns.
router.post('/force-refresh', async (req, res) => {
  const user = db.prepare('SELECT plaid_access_token FROM users WHERE id=?').get(req.user.userId);
  if (!user?.plaid_access_token) return res.json({ error: 'No bank' });
  try {
    await plaidClient.transactionsRefresh({ access_token: user.plaid_access_token });
    res.json({ refreshing: true });
  } catch (e) {
    const p = e.response?.data;
    console.error('transactionsRefresh failed:', p || e.message);
    res.status(500).json({ error: p?.error_message || e.message, error_code: p?.error_code });
  }
});

module.exports = router;
module.exports.getTxns = getTxns;
