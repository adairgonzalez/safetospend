const express = require('express');
const router = express.Router();
const db = require('../db');
const { getClient } = require('../anthropicClient');
const { getAiUsage, recordAiUsage } = require('../aiUsage');

// Same debt-first priorities as the Paycheck Plan auditor, just in a
// conversational voice instead of an audit verdict - the two features
// should agree on what matters, not just on tone.
const SYSTEM_PREFIX = `You are this person's personal financial advisor, embedded in the budgeting app that tracks their real paycheck, bills, and credit card debt. Use exact numbers from the snapshot below - they can see their own numbers, so generic advice wastes their time.

Your priorities, in this order: (1) protect money already earmarked for bills and card minimums - never suggest spending it or treating it as available, (2) push toward paying down the highest-APR credit card debt before anything discretionary, the same avalanche logic the app's own debt-payoff plan uses, (3) call out real risk plainly when it's there - a carried-over deficit, spending outrunning pace, a card close to due - not gently, (4) only once debt and bills are actually covered, help them think through discretionary spending or savings goals.

Give a real recommendation with a number attached, not a menu of options or a "it depends" hedge - you have their actual numbers, that's the point of this. No disclaimers, no "consult a financial professional" unless the question is genuinely outside what this data can speak to. Conversational tone, a few sentences to a short paragraph unless the question actually needs more. No markdown headers or bullet-heavy formatting - write like you're texting someone you're actually helping, not producing a report.

Current financial snapshot:
`;

const titleFrom = (text) => {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  return trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed;
};

// List past chats (most recently active first) for the history switcher.
router.get('/chats', (req, res) => {
  const chats = db.prepare('SELECT id, title, updated_at FROM ai_chats WHERE user_id=? ORDER BY updated_at DESC').all(req.user.userId);
  res.json({ chats });
});

// Full message history for one chat, to rehydrate the client after a
// navigation or reload instead of losing the conversation.
router.get('/chats/:id', (req, res) => {
  const chat = db.prepare('SELECT id, title FROM ai_chats WHERE id=? AND user_id=?').get(req.params.id, req.user.userId);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  const messages = db.prepare('SELECT role, content FROM ai_chat_messages WHERE chat_id=? ORDER BY id ASC').all(chat.id);
  res.json({ id: chat.id, title: chat.title, messages });
});

router.delete('/chats/:id', (req, res) => {
  const info = db.prepare('DELETE FROM ai_chats WHERE id=? AND user_id=?').run(req.params.id, req.user.userId);
  if (info.changes) db.prepare('DELETE FROM ai_chat_messages WHERE chat_id=?').run(req.params.id);
  res.json({ success: true });
});

router.post('/chat', async (req, res) => {
  const client = getClient();
  if (!client) {
    return res.status(503).json({ error: 'AI chat is not configured. Set ANTHROPIC_API_KEY in the server .env file to enable it.' });
  }

  const { summary, messages, chatId } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }
  const cleanMessages = messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content }));
  if (!cleanMessages.length || cleanMessages[0].role !== 'user') {
    return res.status(400).json({ error: 'messages must start with a user message' });
  }

  // If a chatId was passed, it must actually belong to this user - a chat
  // that was deleted (or never existed) starts a fresh one instead of
  // silently writing messages nowhere.
  let chat = chatId ? db.prepare('SELECT id, title FROM ai_chats WHERE id=? AND user_id=?').get(chatId) : null;

  const usage = getAiUsage(req.user.userId);
  if (!usage.allowed) {
    return res.status(429).json({ error: `Daily AI limit reached (${usage.limit} calls/day, shared with the auditor) — resets at midnight. This caps runaway API cost, not normal use.` });
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
      model: 'claude-sonnet-5',
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
    recordAiUsage(req.user.userId);

    const latestUserMessage = cleanMessages[cleanMessages.length - 1].content;
    if (!chat) {
      const info = db.prepare('INSERT INTO ai_chats (user_id, title) VALUES (?,?)').run(req.user.userId, titleFrom(latestUserMessage));
      chat = { id: info.lastInsertRowid };
    }
    db.prepare("UPDATE ai_chats SET updated_at=datetime('now') WHERE id=?").run(chat.id);
    const insertMsg = db.prepare('INSERT INTO ai_chat_messages (chat_id, role, content) VALUES (?,?,?)');
    insertMsg.run(chat.id, 'user', latestUserMessage);
    insertMsg.run(chat.id, 'assistant', textBlock.text);

    res.json({ reply: textBlock.text, chatId: chat.id });
  } catch (e) {
    res.status(502).json({ error: `AI chat request failed: ${e.message}` });
  }
});

module.exports = router;
