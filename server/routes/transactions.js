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

  const paychecks = txns.filter(t => t.amount > 1000 && t.amount < 5000 && PAYCHECK_KEYWORDS.some(k => t.name.toUpperCase().includes(k)))
    .sort((a,b) => new Date(b.date) - new Date(a.date));
  if (!paychecks.length) return res.json({ error: 'No paycheck found' });

  const paycheck = paychecks[0];
  const payAmt = paycheck.amount, payDate = paycheck.date;
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

module.exports = router;
