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
const { authMiddleware } = require('./routes/auth');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/plaid', authMiddleware, plaidRoutes);
app.use('/api/template', authMiddleware, templateRoutes);
app.use('/api/transactions', authMiddleware, transactionsRoutes);
app.use('/api/verify', authMiddleware, verifyRoutes);
const buildDir = path.join(__dirname, '../client/build');
if (fs.existsSync(buildDir)) {
  app.use(express.static(buildDir));
  app.get('*', (req, res) => res.sendFile(path.join(buildDir, 'index.html')));
}
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server on ${PORT}${fs.existsSync(buildDir) ? ' (serving app for phones on the local network too)' : ''}`));
require('./scheduler');
