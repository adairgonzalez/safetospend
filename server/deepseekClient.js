// DeepSeek's API is OpenAI-compatible REST - no SDK needed, plain fetch
// (already relied on elsewhere in this codebase, e.g. the ntfy calls) is
// enough. Docs: https://api-docs.deepseek.com
const BASE_URL = 'https://api.deepseek.com';

// A stray trailing newline/space in the .env value (easy to pick up when
// pasting a key from a browser) makes it an invalid HTTP header value -
// Node's fetch throws a cryptic "did not match the expected pattern" on
// every single call in that case, so trim defensively rather than pass
// the raw env value straight into a header.
function getApiKey() {
  return (process.env.DEEPSEEK_API_KEY || '').trim();
}

function isConfigured() {
  return !!getApiKey();
}

// system: string. messages: [{role: 'user'|'assistant', content: string}].
// Returns the assistant's reply text, or throws with a message suitable to
// show the user directly.
async function chatCompletion({ model = 'deepseek-v4-flash', system, messages, maxTokens = 1024 }) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, ...messages],
      max_tokens: maxTokens,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error?.message || `DeepSeek API error (${res.status})`);
  }
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('DeepSeek returned no reply text.');
  return text;
}

module.exports = { isConfigured, chatCompletion };
