// Standalone Plaid webhook receiver. Deliberately minimal and isolated on
// its own port: this is the only piece of Safe-to-Spend meant to be
// publicly reachable (via Tailscale Funnel), so it carries no dashboard,
// no auth-protected routes, nothing but signature-verified webhook intake.
require('dotenv').config({ path: '../.env' });
const express = require('express');
const { verifyPlaidWebhook } = require('./webhookVerify');
const { tick } = require('./scheduler');

const app = express();
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

app.post('/webhook', async (req, res) => {
  const token = req.header('Plaid-Verification');
  if (!token) return res.status(400).end();

  let payload;
  try {
    payload = await verifyPlaidWebhook(token, req.rawBody);
  } catch (e) {
    console.error('Rejected webhook:', e.message);
    return res.status(401).end();
  }

  // Ack immediately - Plaid expects a fast response and will retry on
  // timeout; do the actual work after responding.
  res.status(200).json({ ok: true });

  const { webhook_type, webhook_code } = req.body;
  console.log(`Verified Plaid webhook: ${webhook_type}/${webhook_code}`);
  if (webhook_type === 'TRANSACTIONS') {
    // Plaid already pulled fresh data to trigger this webhook - reading it
    // now is a free transactionsGet, no need to also pay for a refresh.
    tick({ forceRefresh: false, sendReminder: false }).catch(e => console.error('webhook-triggered tick failed:', e.message));
  }
  void payload;
});

app.get('/webhook', (req, res) => res.status(200).send('Safe-to-Spend webhook receiver'));

const PORT = process.env.WEBHOOK_PORT || 5010;
app.listen(PORT, () => console.log(`Webhook receiver on ${PORT} - expose only this port via Tailscale Funnel`));
