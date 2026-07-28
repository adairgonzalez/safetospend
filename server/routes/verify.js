const express = require('express');
const router = express.Router();
const plaidClient = require('../plaidClient');
const db = require('../db');
const { detectPaycheck } = require('../paycheck');
const { getTxns } = require('./transactions');
const { nextPaydayFrom, isBillActiveThisCycle } = require('../billSchedule');

const envMap = {
  rent: process.env.SAVINGS_RENT_ID,
  tesla: process.env.SAVINGS_CAR_INSURANCE_ID,
  insurance: process.env.SAVINGS_CAR_INSURANCE_ID,
  electricity: process.env.SAVINGS_CAR_INSURANCE_ID,
  credit_card_minimums: process.env.SAVINGS_CC_MIN_ID,
  extra_debt_payment: process.env.SAVINGS_DEBT_EXTRA_ID,
};

router.post('/verify-transfers', async (req, res) => {
  const user = db.prepare('SELECT plaid_access_token FROM users WHERE id=?').get(req.user.userId);
  if (!user?.plaid_access_token) return res.json({ error: 'No bank linked' });

  let accts, txns;
  try {
    accts = (await plaidClient.accountsGet({ access_token: user.plaid_access_token })).data.accounts;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10);
    const end = now.toISOString().slice(0, 10);
    txns = await getTxns(user.plaid_access_token, start, end);
  } catch (e) {
    const p = e.response?.data;
    console.error('verify-transfers fetch failed:', p || e.message);
    return res.status(500).json({ error: p?.error_message || e.message });
  }

  const paycheck = detectPaycheck(txns);
  if (!paycheck) return res.json({ allGood: false, details: [{ category: 'All bills', status: 'No paycheck detected yet this cycle' }] });
  const payDate = paycheck.date;
  const nextPayday = nextPaydayFrom(payDate);

  const template = db.prepare('SELECT * FROM bills_template').all();

  // Several bills can share one savings account, so verify the account's
  // balance rose by the combined total rather than checking bill-by-bill.
  const perAccount = {};
  const details = [];
  let allGood = true;
  for (const bill of template) {
    if (bill.match_name) continue; // autopays from checking - nothing to transfer or verify in savings
    if (bill.pass_through) continue; // funded from outside the user's own paycheck - nothing of theirs to verify
    if (!isBillActiveThisCycle(bill, payDate, nextPayday)) continue; // not due before the next paycheck - nothing to verify yet
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

  const getBaseline = db.prepare('SELECT baseline FROM cycle_baselines WHERE user_id=? AND account_id=? AND pay_date=?');
  const setBaseline = db.prepare('INSERT OR IGNORE INTO cycle_baselines (user_id, account_id, pay_date, baseline) VALUES (?,?,?,?)');
  const hasAnyBaseline = db.prepare('SELECT 1 FROM cycle_baselines WHERE user_id=? AND account_id=? LIMIT 1');
  const getLegacyBalance = db.prepare('SELECT last_balance FROM savings_balances WHERE account_id=?');
  const isVerified = db.prepare('SELECT 1 FROM verified_transfers WHERE user_id=? AND pay_date=? AND account_id=?');
  const setVerified = db.prepare("INSERT OR IGNORE INTO verified_transfers (user_id, pay_date, account_id, verified_at) VALUES (?,?,?,datetime('now'))");

  for (const [acctId, exp] of Object.entries(perAccount)) {
    const label = exp.categories.join(' + ');
    const acct = accts.find(a => a.account_id === acctId);
    if (!acct) { details.push({ category: label, status: 'Account not found at bank' }); allGood = false; continue; }
    const curBalance = acct.balances.current;

    // Once confirmed for this pay cycle, it stays confirmed. A later
    // withdrawal to actually pay a bill (e.g. the credit card minimum
    // going out to the card issuer) drops the balance again, but that's
    // not a missing transfer - re-deriving from the live balance every
    // time would falsely flip a real, already-verified transfer back to
    // MISSING the moment any of that money gets spent on its purpose.
    if (isVerified.get(req.user.userId, payDate, acctId)) {
      details.push({ category: label, status: 'Transferred' });
      continue;
    }

    let baselineRow = getBaseline.get(req.user.userId, acctId, payDate);
    if (!baselineRow) {
      // One-time migration from the old ratcheting system. Its stored value
      // is NOT trustworthy as a numeric baseline - the ratchet bug itself
      // may have already advanced it past the true pre-transfer figure. But
      // the row only ever got written after a successful verify, so its
      // mere existence proves this cycle's transfer already happened.
      // Trust that fact, mark it confirmed now, and start a clean baseline
      // (today's real balance) for every cycle from here on.
      const migrating = !hasAnyBaseline.get(req.user.userId, acctId) && getLegacyBalance.get(acctId);
      setBaseline.run(req.user.userId, acctId, payDate, curBalance);
      if (migrating) {
        setVerified.run(req.user.userId, payDate, acctId);
        details.push({ category: label, status: 'Transferred' });
        continue;
      }
      details.push({ category: label, status: `Baseline recorded at $${curBalance.toFixed(2)} for this pay cycle — verify again after transferring` });
      continue;
    }

    const expected = baselineRow.baseline + exp.amount;
    if (curBalance >= expected - 0.10) {
      setVerified.run(req.user.userId, payDate, acctId);
      details.push({ category: label, status: 'Transferred' });
    } else {
      details.push({ category: label, status: 'MISSING', expected: Math.round(expected * 100) / 100, actual: curBalance });
      allGood = false;
    }
  }
  res.json({ allGood, details });
});

// Manual escape hatch for a real gap in the balance-snapshot approach above:
// if some of a transfer already went back out to pay a bill before this
// endpoint ever ran while the balance was still elevated, the account can
// never climb high enough again this cycle to auto-verify, even though the
// transfer genuinely happened. Lets the user assert it directly instead of
// being stuck for the rest of the pay cycle.
router.post('/mark-transferred', async (req, res) => {
  const { category } = req.body || {};
  if (!category) return res.status(400).json({ error: 'category required' });

  const user = db.prepare('SELECT plaid_access_token FROM users WHERE id=?').get(req.user.userId);
  if (!user?.plaid_access_token) return res.json({ error: 'No bank linked' });

  let txns;
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10);
    const end = now.toISOString().slice(0, 10);
    txns = await getTxns(user.plaid_access_token, start, end);
  } catch (e) {
    const p = e.response?.data;
    console.error('mark-transferred fetch failed:', p || e.message);
    return res.status(500).json({ error: p?.error_message || e.message });
  }

  const paycheck = detectPaycheck(txns);
  if (!paycheck) return res.status(400).json({ error: 'No paycheck detected yet this cycle' });

  const key = category.replace(/ /g, '_').toLowerCase();
  const acctId = envMap[key];
  if (!acctId || acctId === 'placeholder') {
    return res.status(400).json({ error: 'No savings account mapped for this bill in .env' });
  }

  db.prepare("INSERT OR IGNORE INTO verified_transfers (user_id, pay_date, account_id, verified_at) VALUES (?,?,?,datetime('now'))")
    .run(req.user.userId, paycheck.date, acctId);
  res.json({ success: true });
});

module.exports = router;
