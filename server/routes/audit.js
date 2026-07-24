const express = require('express');
const router = express.Router();
const { isConfigured, chatCompletion } = require('../deepseekClient');
const { getAiUsage, recordAiUsage } = require('../aiUsage');

const SYSTEM_PROMPT = `You are a strict, no-nonsense personal financial auditor and planner reviewing one pay cycle for a specific person. You are given JSON describing: their paycheck, the bills/transfers due this cycle and whether each is confirmed handled, any credit cards currently overdue or due today, and a computed debt-payoff plan for their leftover money.

Your job:
1. Audit: state plainly whether everything in the checklist is actually handled. Name anything still outstanding, if there is any (there usually won't be, since you're only called after the checklist is complete - say so briefly and move on).
2. Verdict: state the exact dollar amount that is genuinely safe to spend freely, separate from what the debt payoff plan says should go toward balances.
3. Enforcement: be blunt about any red flags - a carried-over deficit, a debt plan that leaves little or nothing free, spending pace outrunning budget. Your job is to stop money leaking to discretionary spending before debt is under control, not to be encouraging.
4. Close with exactly one line starting with either "APPROVED:" or "HOLD:" giving the final call and the dollar amount.

Plain prose, no markdown headers or bullet lists, under 180 words. Address the user directly as "you".`;

router.post('/review', async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ error: 'AI auditor is not configured. Set DEEPSEEK_API_KEY in the server .env file to enable it.' });
  }

  const usage = getAiUsage(req.user.userId);
  if (!usage.allowed) {
    return res.status(429).json({ error: `Daily AI limit reached (${usage.limit} calls/day, shared with Ask AI chat) — resets at midnight. This caps runaway API cost, not normal use.` });
  }

  try {
    const text = await chatCompletion({
      model: 'deepseek-chat',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(req.body || {}) }],
      maxTokens: 1024,
    });
    recordAiUsage(req.user.userId);
    res.json({ review: text });
  } catch (e) {
    console.error('Auditor request failed:', e);
    res.status(502).json({ error: `Auditor request failed: ${e.message}` });
  }
});

module.exports = router;
