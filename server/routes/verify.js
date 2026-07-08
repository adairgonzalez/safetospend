const express = require('express');
const router = express.Router();
const plaidClient = require('../plaidClient');
const db = require('../db');

router.post('/verify-transfers', async (req, res) => {
  const user = db.prepare('SELECT plaid_access_token FROM users WHERE id=?').get(req.user.userId);
  const accessToken = user.plaid_access_token;
  const accts = (await plaidClient.accountsGet({ access_token: accessToken })).data.accounts;
  const template = db.prepare('SELECT * FROM bills_template').all();
  const envMap = {
    rent: process.env.SAVINGS_RENT_ID,
    tesla: process.env.SAVINGS_CAR_INSURANCE_ID,
    insurance: process.env.SAVINGS_CAR_INSURANCE_ID,
    electricity: process.env.SAVINGS_CAR_INSURANCE_ID,
    cc_minimums: process.env.SAVINGS_CC_MIN_ID,
    extra_debt_payment: process.env.SAVINGS_DEBT_EXTRA_ID,
  };
  let allGood = true;
  const details = [];
  for (const bill of template) {
    const acctId = envMap[bill.category.replace(/ /g,'_').toLowerCase()];
    if (!acctId) continue;
    const acct = accts.find(a => a.account_id === acctId);
    if (!acct) { details.push({ category: bill.category, status: 'Account not found' }); allGood = false; continue; }
    const curBalance = acct.balances.current;
    const prev = db.prepare('SELECT last_balance FROM savings_balances WHERE account_id=?').get(acctId);
    const lastBal = prev?.last_balance || 0;
    const expected = lastBal + bill.amount;
    const ok = curBalance >= expected - 0.10;
    if (ok) {
      db.prepare('INSERT OR REPLACE INTO savings_balances (user_id, account_id, last_balance, updated_at) VALUES (?,?,?,datetime(\'now\'))')
        .run(req.user.userId, acctId, curBalance);
      details.push({ category: bill.category, status: 'Transferred' });
    } else {
      details.push({ category: bill.category, status: 'MISSING', expected, actual: curBalance });
      allGood = false;
    }
  }
  res.json({ allGood, details });
});

module.exports = router;
