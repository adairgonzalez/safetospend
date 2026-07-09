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
  const response = await plaidClient.linkTokenCreate(request);
  res.json({ link_token: response.data.link_token });
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

module.exports = router;
