const express = require('express');
const router = express.Router();
const db = require('../db');

// Past cycles only (current cycle's live numbers already come from
// /transactions/safe-to-spend) - excludes whichever pay_date is most recent.
router.get('/history', (req, res) => {
  const rows = db.prepare('SELECT pay_date, paycheck_amount, discretionary_budget, total_spent, safe_to_spend FROM cycle_history WHERE user_id=? ORDER BY pay_date DESC')
    .all(req.user.userId);
  const [, ...past] = rows;
  res.json({ history: past.slice(0, 8) });
});

module.exports = router;
