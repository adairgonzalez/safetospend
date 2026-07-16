const express = require('express');
const router = express.Router();
const db = require('../db');
const plaidClient = require('../plaidClient');
const { isTransfer } = require('../paycheck');
const { getTxns } = require('./transactions');

// Past cycles only (current cycle's live numbers already come from
// /transactions/safe-to-spend) - excludes whichever pay_date is most recent.
router.get('/history', (req, res) => {
  const rows = db.prepare('SELECT pay_date, paycheck_amount, discretionary_budget, total_spent, safe_to_spend FROM cycle_history WHERE user_id=? ORDER BY pay_date DESC')
    .all(req.user.userId);
  const [, ...past] = rows;
  res.json({ history: past.slice(0, 8) });
});

// What's actually happening inside the bill-money savings account(s):
// the incoming transfer plus every payment that's gone back out to
// creditors/landlord since, not just the lump-sum arrival verify.js checks.
router.get('/bills-account', async (req, res) => {
  const user = db.prepare('SELECT plaid_access_token FROM users WHERE id=?').get(req.user.userId);
  if (!user?.plaid_access_token) return res.json({ error: 'No bank linked' });

  const savingsIds = [...new Set([
    process.env.SAVINGS_RENT_ID, process.env.SAVINGS_CAR_INSURANCE_ID,
    process.env.SAVINGS_CC_MIN_ID, process.env.SAVINGS_DEBT_EXTRA_ID,
  ].filter(id => id && id !== 'placeholder'))];
  if (!savingsIds.length) return res.json({ accounts: [] });

  try {
    const accts = (await plaidClient.accountsGet({ access_token: user.plaid_access_token })).data.accounts;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10);
    const end = now.toISOString().slice(0, 10);
    const txns = await getTxns(user.plaid_access_token, start, end);

    const accounts = savingsIds.map(id => {
      const acct = accts.find(a => a.account_id === id);
      const activity = txns
        .filter(t => t.account_id === id)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .map(t => ({
          date: t.date, name: t.name, amount: -t.amount, pending: !!t.pending,
          isIncomingTransfer: t.amount < 0 && isTransfer(t),
        }));
      return {
        account_id: id,
        name: acct?.name || 'Savings',
        mask: acct?.mask,
        balance: acct?.balances?.current ?? null,
        activity,
      };
    });
    res.json({ accounts });
  } catch (e) {
    const p = e.response?.data;
    console.error('bills-account fetch failed:', p || e.message);
    res.status(500).json({ error: p?.error_message || e.message });
  }
});

module.exports = router;
