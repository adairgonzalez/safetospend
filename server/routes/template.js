const express = require('express');
const router = express.Router();
const db = require('../db');
router.get('/', (req, res) => res.json(db.prepare('SELECT * FROM bills_template').all()));
router.post('/', (req, res) => {
  const { categories } = req.body; // [{category, amount}]
  db.prepare('DELETE FROM bills_template').run();
  const insert = db.prepare('INSERT INTO bills_template (category, amount) VALUES (?,?)');
  for (const c of categories) insert.run(c.category, c.amount);
  res.json({ success: true });
});
module.exports = router;
