const crypto = require('crypto');
const plaidClient = require('./plaidClient');

// Plaid signs webhooks with a per-key-id ES256 JWT (Plaid-Verification
// header). Keys rarely rotate, so cache them by kid.
const keyCache = new Map();

async function getVerificationKey(keyId) {
  if (keyCache.has(keyId)) return keyCache.get(keyId);
  const res = await plaidClient.webhookVerificationKeyGet({ key_id: keyId });
  const key = res.data.key;
  keyCache.set(keyId, key);
  return key;
}

// Verifies a Plaid webhook: JWT signature (ES256, JOSE raw-signature
// format), freshness (reject anything older than 5 minutes to block
// replay), and that the JWT's body hash matches what was actually posted.
async function verifyPlaidWebhook(jwtToken, rawBody) {
  const parts = jwtToken.split('.');
  if (parts.length !== 3) throw new Error('Malformed webhook JWT');
  const [headerB64, payloadB64, sigB64] = parts;

  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
  if (header.alg !== 'ES256') throw new Error(`Unexpected webhook JWT alg: ${header.alg}`);

  const jwk = await getVerificationKey(header.kid);
  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const signature = Buffer.from(sigB64, 'base64url');
  const signedData = Buffer.from(`${headerB64}.${payloadB64}`);
  const valid = crypto.verify('sha256', signedData, { key: publicKey, dsaEncoding: 'ieee-p1363' }, signature);
  if (!valid) throw new Error('Invalid webhook signature');

  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
  if (Date.now() / 1000 - payload.iat > 300) throw new Error('Webhook JWT too old (possible replay)');

  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  if (bodyHash !== payload.request_body_sha256) throw new Error('Webhook body hash mismatch');

  return payload;
}

module.exports = { verifyPlaidWebhook };
