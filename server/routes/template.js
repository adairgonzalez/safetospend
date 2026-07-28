const express = require('express');
const router = express.Router();
const db = require('../db');
router.get('/', (req, res) => res.json(db.prepare('SELECT * FROM bills_template').all()));
router.post('/', (req, res) => {
  const { categories } = req.body; // [{category, amount, due_day}]
  // Preserve match_name (autopay-from-checking flag) by category name across
  // saves - the edit form only sends category/amount/due_day, and a blanket
  // delete+reinsert would otherwise silently drop it.
  const existing = new Map(db.prepare('SELECT category, match_name FROM bills_template').all().map(r => [r.category, r.match_name]));
  db.prepare('DELETE FROM bills_template').run();
  const insert = db.prepare('INSERT INTO bills_template (category, amount, match_name, due_day) VALUES (?,?,?,?)');
  for (const c of categories) insert.run(c.category, c.amount, existing.get(c.category) || null, c.due_day || null);
  res.json({ success: true });
});
module.exports = router;
