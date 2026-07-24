require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const authRoutes = require('./routes/auth');
const plaidRoutes = require('./routes/plaid');
const templateRoutes = require('./routes/template');
const transactionsRoutes = require('./routes/transactions');
const verifyRoutes = require('./routes/verify');
const insightsRoutes = require('./routes/insights');
const cardsRoutes = require('./routes/cards');
const auditRoutes = require('./routes/audit');
const aiChatRoutes = require('./routes/aiChat');
const { authMiddleware } = require('./routes/auth');

const app = express();
app.use(cors());
// Ask AI chat accepts an optional photo attachment (base64 data URL), so it
// needs a larger body limit than the rest of the API - scoped to this one
// path so other routes keep the tighter default.
app.use('/api/ai', express.json({ limit: '8mb' }));
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/plaid', authMiddleware, plaidRoutes);
app.use('/api/template', authMiddleware, templateRoutes);
app.use('/api/transactions', authMiddleware, transactionsRoutes);
app.use('/api/verify', authMiddleware, verifyRoutes);
app.use('/api/insights', authMiddleware, insightsRoutes);
app.use('/api/cards', authMiddleware, cardsRoutes);
app.use('/api/audit', authMiddleware, auditRoutes);
app.use('/api/ai', authMiddleware, aiChatRoutes);
const isQA = process.env.PLAID_ENV !== 'production';
app.get('/api/meta', (req, res) => res.json({ env: process.env.PLAID_ENV || 'sandbox', qa: isQA }));

const buildDir = path.join(__dirname, '../client/build');
if (isQA && fs.existsSync(buildDir)) {
  // QA wears red so it can't be mistaken for the real thing
  app.get('/apple-touch-icon.png', (req, res) => res.sendFile(path.join(buildDir, 'apple-touch-icon-qa.png')));
  app.get('/icon.svg', (req, res) => res.sendFile(path.join(buildDir, 'icon-qa.svg')));
  app.get('/manifest.json', (req, res) => {
    const m = JSON.parse(fs.readFileSync(path.join(buildDir, 'manifest.json'), 'utf8'));
    m.name = 'Safe to Spend QA'; m.short_name = 'STS QA';
    m.icons = [{ src: 'icon-qa.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }];
    res.json(m);
  });
}
if (fs.existsSync(buildDir)) {
  app.use(express.static(buildDir));
  app.get('*', (req, res) => res.sendFile(path.join(buildDir, 'index.html')));
}
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server on ${PORT}${fs.existsSync(buildDir) ? ' (serving app for phones on the local network too)' : ''}`));
require('./scheduler');
