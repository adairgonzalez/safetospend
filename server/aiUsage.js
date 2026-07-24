const db = require('./db');

db.exec('CREATE TABLE IF NOT EXISTS ai_usage (user_id INTEGER, date TEXT, count INTEGER DEFAULT 0, PRIMARY KEY (user_id, date))');

// Shared across the auditor and the chat - both bill the same Anthropic key,
// so one cap on total daily calls is what actually protects against runaway
// cost, not a per-feature split. 30/day is generous for how either feature
// is actually used (the auditor once or twice a cycle, the chat for a
// handful of real questions) while still bounding worst-case cost to
// roughly a dollar a day if something looped or got spammed.
const DAILY_LIMIT = 30;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Read-only - callers should check this BEFORE spending money on a Claude
// call, then call recordAiUsage AFTER it actually succeeds, so a rejected
// or failed request never counts against the quota.
function getAiUsage(userId) {
  const date = todayStr();
  const row = db.prepare('SELECT count FROM ai_usage WHERE user_id=? AND date=?').get(userId, date);
  const count = row?.count || 0;
  return { count, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - count), allowed: count < DAILY_LIMIT };
}

function recordAiUsage(userId) {
  const date = todayStr();
  db.prepare(`INSERT INTO ai_usage (user_id, date, count) VALUES (?,?,1)
              ON CONFLICT(user_id, date) DO UPDATE SET count = count + 1`).run(userId, date);
}

module.exports = { getAiUsage, recordAiUsage, DAILY_LIMIT };
