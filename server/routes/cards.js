const express = require('express');
const router = express.Router();
const db = require('../db');
const { getCardStatus } = require('../cardStatus');

const statusRank = { overdue: 0, due_today: 1, upcoming: 2, unknown: 3 };

router.get('/', (req, res) => {
  const cards = db.prepare('SELECT * FROM credit_cards WHERE user_id=?').all(req.user.userId);
  // Only dateStr (a plain 'YYYY-MM-DD' string) goes out, never the raw Date
  // - JSON.stringify would otherwise call toISOString() on it automatically,
  // reintroducing the same UTC-shift-to-tomorrow bug fixed on the client.
  const withStatus = cards.map(c => {
    const s = getCardStatus(c);
    return { ...c, status: s.status, dateStr: s.dateStr, daysOverdue: s.daysOverdue };
  });
  withStatus.sort((a, b) => statusRank[a.status] - statusRank[b.status] || (a.dateStr || '').localeCompare(b.dateStr || ''));
  res.json(withStatus);
});

router.post('/', (req, res) => {
  const { name, minimum, due_day, balance, apr, credit_limit, closed } = req.body;
  if (!name || typeof minimum !== 'number') return res.status(400).json({ error: 'name and minimum required' });
  const day = due_day ? Math.max(1, Math.min(31, Number(due_day))) : null;
  const bal = typeof balance === 'number' ? balance : null;
  const rate = typeof apr === 'number' ? apr : null;
  const limit = typeof credit_limit === 'number' ? credit_limit : null;
  const info = db.prepare('INSERT INTO credit_cards (user_id, name, minimum, due_day, balance, apr, credit_limit, closed) VALUES (?,?,?,?,?,?,?,?)').run(req.user.userId, name, minimum, day, bal, rate, limit, closed ? 1 : 0);
  res.json({ success: true, id: info.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { name, minimum, due_day, balance, apr, credit_limit, closed } = req.body;
  const day = due_day ? Math.max(1, Math.min(31, Number(due_day))) : null;
  const bal = typeof balance === 'number' ? balance : null;
  const rate = typeof apr === 'number' ? apr : null;
  const limit = typeof credit_limit === 'number' ? credit_limit : null;
  db.prepare('UPDATE credit_cards SET name=?, minimum=?, due_day=?, balance=?, apr=?, credit_limit=?, closed=? WHERE id=? AND user_id=?')
    .run(name, minimum, day, bal, rate, limit, closed ? 1 : 0, req.params.id, req.user.userId);
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
