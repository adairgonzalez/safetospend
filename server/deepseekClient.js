// DeepSeek's API is OpenAI-compatible REST - no SDK needed, plain fetch
// (already relied on elsewhere in this codebase, e.g. the ntfy calls) is
// enough. Docs: https://api-docs.deepseek.com
const BASE_URL = 'https://api.deepseek.com';

function isConfigured() {
  return !!process.env.DEEPSEEK_API_KEY;
}

// system: string. messages: [{role: 'user'|'assistant', content: string}].
// Returns the assistant's reply text, or throws with a message suitable to
// show the user directly.
async function chatCompletion({ model = 'deepseek-chat', system, messages, maxTokens = 1024 }) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
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
