const express = require('express');
const router = express.Router();
const { getClient } = require('../anthropicClient');

const SYSTEM_PREFIX = `You are a knowledgeable, direct personal financial advisor for this specific person, chatting with them in an app built around their real bank data. Use exact numbers from the snapshot below when relevant instead of hedging with generic advice - they can see their own numbers, so vague answers waste their time. Be conversational but substantive: give real answers and recommendations, not disclaimers or "consult a professional" deflections, unless a question is genuinely outside what the data can speak to. Keep answers focused - a few sentences to a short paragraph is usually enough, longer only when the question actually calls for it. No markdown headers or bullet-heavy formatting; write like you're texting someone you're helping, not producing a report.

Current financial snapshot:
`;

router.post('/chat', async (req, res) => {
  const client = getClient();
  if (!client) {
    return res.status(503).json({ error: 'AI chat is not configured. Set ANTHROPIC_API_KEY in the server .env file to enable it.' });
  }

  const { summary, messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }
  const cleanMessages = messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content }));
  if (!cleanMessages.length || cleanMessages[0].role !== 'user') {
    return res.status(400).json({ error: 'messages must start with a user message' });
  }

  // Prompt caching: the client resends the full running conversation every
  // turn (the API is stateless), so without a cache breakpoint every prior
  // message gets billed as fresh input again on every single reply. Marking
  // the system block (the snapshot - identical for the whole chat) and the
  // last message of the *previous* turn means each new request's prefix
  // matches what was already cached last turn, so only the newest message
  // is billed at full price. Cache reads run ~10% of normal input cost.
  const apiMessages = cleanMessages.map((m, i) => (
    i === cleanMessages.length - 2
      ? { role: m.role, content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }] }
      : { role: m.role, content: m.content }
  ));

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1536,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system: [{
        type: 'text',
        text: SYSTEM_PREFIX + (typeof summary === 'string' ? summary : '(no snapshot provided)'),
        cache_control: { type: 'ephemeral' },
      }],
      messages: apiMessages,
    });
    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock) return res.status(502).json({ error: 'No text response from the assistant.' });
    res.json({ reply: textBlock.text });
  } catch (e) {
    res.status(502).json({ error: `AI chat request failed: ${e.message}` });
  }
});

module.exports = router;
