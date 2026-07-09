const express = require('express');
const router = express.Router();
const plaidClient = require('../plaidClient');
const db = require('../db');

router.post('/create_link_token', async (req, res) => {
  const request = {
    user: { client_user_id: req.user.userId.toString() },
    client_name: 'SafeToSpend',
    products: ['transactions'],
    country_codes: ['US'], language: 'en',
  };
  if (process.env.PLAID_REDIRECT_URI) request.redirect_uri = process.env.PLAID_REDIRECT_URI;
  if (process.env.PLAID_WEBHOOK_URL) request.webhook = process.env.PLAID_WEBHOOK_URL;
  try {
    const response = await plaidClient.linkTokenCreate(request);
    res.json({ link_token: response.data.link_token });
  } catch (e) {
    const plaidErr = e.response?.data;
    console.error('linkTokenCreate failed:', plaidErr || e.message);
    res.status(500).json({ error: plaidErr?.error_message || e.message, error_code: plaidErr?.error_code });
  }
});

router.post('/exchange_public_token', async (req, res) => {
  const exchange = await plaidClient.itemPublicTokenExchange({ public_token: req.body.public_token });
  db.prepare('UPDATE users SET plaid_access_token=?, plaid_item_id=? WHERE id=?').run(
    exchange.data.access_token, exchange.data.item_id, req.user.userId
  );
  res.json({ success: true });
});

router.get('/accounts', async (req, res) => {
  const user = db.prepare('SELECT plaid_access_token FROM users WHERE id=?').get(req.user.userId);
  const response = await plaidClient.accountsGet({ access_token: user.plaid_access_token });
  res.json(response.data.accounts);
});

// One-time call (after Tailscale Funnel is up) to point an already-linked
// item at PLAID_WEBHOOK_URL without re-linking the bank.
router.post('/set-webhook', async (req, res) => {
  if (!process.env.PLAID_WEBHOOK_URL) return res.status(400).json({ error: 'PLAID_WEBHOOK_URL not set in .env' });
  const user = db.prepare('SELECT plaid_access_token FROM users WHERE id=?').get(req.user.userId);
  if (!user?.plaid_access_token) return res.json({ error: 'No bank linked' });
  try {
    await plaidClient.itemWebhookUpdate({ access_token: user.plaid_access_token, webhook: process.env.PLAID_WEBHOOK_URL });
    res.json({ success: true, webhook: process.env.PLAID_WEBHOOK_URL });
  } catch (e) {
    const p = e.response?.data;
    console.error('itemWebhookUpdate failed:', p || e.message);
    res.status(500).json({ error: p?.error_message || e.message, error_code: p?.error_code });
  }
});

module.exports = router;
