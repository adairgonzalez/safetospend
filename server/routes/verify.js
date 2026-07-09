const express = require('express');
const router = express.Router();
const plaidClient = require('../plaidClient');
const db = require('../db');

router.post('/verify-transfers', async (req, res) => {
  const user = db.prepare('SELECT plaid_access_token FROM users WHERE id=?').get(req.user.userId);
  if (!user?.plaid_access_token) return res.json({ error: 'No bank linked' });
  let accts;
  try {
    accts = (await plaidClient.accountsGet({ access_token: user.plaid_access_token })).data.accounts;
  } catch (e) {
    const p = e.response?.data;
    console.error('accountsGet failed:', p || e.message);
    return res.status(500).json({ error: p?.error_message || e.message });
  }

  const template = db.prepare('SELECT * FROM bills_template').all();
  const envMap = {
    rent: process.env.SAVINGS_RENT_ID,
    tesla: process.env.SAVINGS_CAR_INSURANCE_ID,
    insurance: process.env.SAVINGS_CAR_INSURANCE_ID,
    electricity: process.env.SAVINGS_CAR_INSURANCE_ID,
    credit_card_minimums: process.env.SAVINGS_CC_MIN_ID,
    extra_debt_payment: process.env.SAVINGS_DEBT_EXTRA_ID,
  };

  // Several bills can share one savings account, so verify the account's
  // balance rose by the combined total rather than checking bill-by-bill.
  const perAccount = {};
  const details = [];
  let allGood = true;
  for (const bill of template) {
    const key = bill.category.replace(/ /g, '_').toLowerCase();
    const acctId = envMap[key];
    if (!acctId || acctId === 'placeholder') {
      details.push({ category: bill.category, status: 'No savings account mapped in .env' });
      continue;
    }
    if (!perAccount[acctId]) perAccount[acctId] = { amount: 0, categories: [] };
    perAccount[acctId].amount += bill.amount;
    perAccount[acctId].categories.push(bill.category);
  }

  const upsert = db.prepare("INSERT OR REPLACE INTO savings_balances (user_id, account_id, last_balance, updated_at) VALUES (?,?,?,datetime('now'))");
  for (const [acctId, exp] of Object.entries(perAccount)) {
    const label = exp.categories.join(' + ');
    const acct = accts.find(a => a.account_id === acctId);
    if (!acct) { details.push({ category: label, status: 'Account not found at bank' }); allGood = false; continue; }
    const curBalance = acct.balances.current;
    const prev = db.prepare('SELECT last_balance FROM savings_balances WHERE account_id=?').get(acctId);
    if (!prev) {
      upsert.run(req.user.userId, acctId, curBalance);
      details.push({ category: label, status: `Baseline recorded at $${curBalance.toFixed(2)} — verification starts next check` });
      continue;
    }
    const expected = prev.last_balance + exp.amount;
    if (curBalance >= expected - 0.10) {
      upsert.run(req.user.userId, acctId, curBalance);
      details.push({ category: label, status: 'Transferred' });
    } else {
      details.push({ category: label, status: 'MISSING', expected: Math.round(expected * 100) / 100, actual: curBalance });
      allGood = false;
    }
  }
  res.json({ allGood, details });
});

module.exports = router;
