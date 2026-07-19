const Anthropic = require('@anthropic-ai/sdk');

let client = null;

// Returns null (not a thrown error) when no API key is configured, so callers
// can respond with a clear "not set up" message instead of crashing - this
// integration is opt-in and the key lives in the operator's own .env.
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic();
  return client;
}

module.exports = { getClient };
