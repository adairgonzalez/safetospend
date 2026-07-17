const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM credit_cards WHERE user_id=? ORDER BY due_day IS NULL, due_day').all(req.user.userId));
});

router.post('/', (req, res) => {
  const { name, minimum, due_day } = req.body;
  if (!name || typeof minimum !== 'number') return res.status(400).json({ error: 'name and minimum required' });
  const day = due_day ? Math.max(1, Math.min(31, Number(due_day))) : null;
  const info = db.prepare('INSERT INTO credit_cards (user_id, name, minimum, due_day) VALUES (?,?,?,?)').run(req.user.userId, name, minimum, day);
  res.json({ success: true, id: info.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { name, minimum, due_day } = req.body;
  const day = due_day ? Math.max(1, Math.min(31, Number(due_day))) : null;
  db.prepare('UPDATE credit_cards SET name=?, minimum=?, due_day=? WHERE id=? AND user_id=?')
    .run(name, minimum, day, req.params.id, req.user.userId);
  res.json({ success: true });
});

router.post('/:id/mark-paid', (req, res) => {
  db.prepare("UPDATE credit_cards SET last_paid=datetime('now') WHERE id=? AND user_id=?").run(req.params.id, req.user.userId);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM credit_cards WHERE id=? AND user_id=?').run(req.params.id, req.user.userId);
  res.json({ success: true });
});

module.exports = router;
