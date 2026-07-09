const express = require('express');
const router = express.Router();
const plaidClient = require('../plaidClient');
const db = require('../db');

const PAYCHECK_KEYWORDS = ['PAYROLL','DIRECT DEP','DEPOSIT'];
const SPENDING_CATS = ['Food and Drink','Restaurants','Shops','Entertainment','Recreation','Shopping','Clothing','Electronics','Gas','Coffee','Fast Food','Alcohol','Bar'];

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

  // Plaid amounts: positive = money out, negative = money in. Paychecks are negative.
  // A pinned account is a strong enough signal on its own (employer names rarely
  // contain PAYROLL/DEPOSIT); only fall back to the keyword list when no
  // account is pinned, where amount range alone would be too loose.
  const hasPinnedAccount = process.env.PAYCHECK_ACCOUNT_ID && process.env.PAYCHECK_ACCOUNT_ID !== 'placeholder';
  const paychecks = txns.filter(t => {
    if (hasPinnedAccount && t.account_id !== process.env.PAYCHECK_ACCOUNT_ID) return false;
    const deposit = -t.amount;
    if (!(deposit > 1000 && deposit < 5000)) return false;
    return hasPinnedAccount || PAYCHECK_KEYWORDS.some(k => (t.name || '').toUpperCase().includes(k));
  }).sort((a,b) => new Date(b.date) - new Date(a.date));
  if (!paychecks.length) return res.json({ error: 'No paycheck found yet', retryable: true });

  const paycheck = paychecks[0];
  const payAmt = -paycheck.amount, payDate = paycheck.date;
  const template = db.prepare('SELECT * FROM bills_template').all();
  const allocated = template.reduce((s,r) => s + r.amount, 0);
  const discBudget = payAmt - allocated;

  const spending = txns.filter(t => t.date >= payDate && t.amount > 0 && SPENDING_CATS.some(c => (t.category||[]).includes(c)));
  const spent = spending.reduce((s,t) => s + t.amount, 0);
  const safe = discBudget - spent;

  res.json({
    safeToSpend: Math.round(safe*100)/100,
    paycheckAmount: payAmt,
    paycheckDate: payDate,
    discretionaryBudget: discBudget,
    totalSpent: spent,
    nextPayday: new Date(new Date(payDate).getTime() + 14*86400000).toISOString().slice(0,10),
    checklist: template.map(r => ({ category: r.category, amount: r.amount, description: `Transfer $${r.amount} to ${r.category}` }))
  });
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
      .map(t => ({ date: t.date, name: t.name, amount: t.amount, account_id: t.account_id, pending: t.pending })));
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
