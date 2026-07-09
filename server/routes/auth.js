const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const JWT_SECRET = process.env.JWT_SECRET || 'fallback';

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); } catch { res.status(401).json({ error: 'Invalid token' }); }
}

router.post('/register', async (req, res) => {
  const username = (req.body.username || '').trim();
  const { password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const hash = await bcrypt.hash(password, 10);
  try {
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?,?)').run(username, hash);
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    const token = jwt.sign({ userId: user.id }, JWT_SECRET);
    res.json({ token });
  } catch { res.status(400).json({ error: 'User exists' }); }
});

router.post('/login', async (req, res) => {
  const username = (req.body.username || '').trim();
  const { password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Invalid username or password' });
  res.json({ token: jwt.sign({ userId: user.id }, JWT_SECRET) });
});

module.exports = router;
module.exports.authMiddleware = authMiddleware;
