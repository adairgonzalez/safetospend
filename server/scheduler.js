const cron = require('node-cron');
const jwt = require('jsonwebtoken');
const db = require('./db');
const plaidClient = require('./plaidClient');
const { localISODate } = require('./cardStatus');

const PORT = process.env.PORT || 5001;
const TOPIC = process.env.NTFY_TOPIC;

db.exec('CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT)');
const getState = (k) => db.prepare('SELECT value FROM app_state WHERE key=?').get(k)?.value;
const setState = (k, v) => db.prepare('INSERT OR REPLACE INTO app_state (key, value) VALUES (?,?)').run(k, String(v));

const usd = (n) => `$${Number(n).toFixed(2)}`;

async function notify(title, message, priority = 'default') {
  if (!TOPIC) return;
  try {
    await fetch(`https://ntfy.sh/${encodeURIComponent(TOPIC)}`, {
      method: 'POST',
      body: message,
      headers: { Title: title, Priority: priority },
    });
  } catch (e) { console.error('ntfy notify failed:', e.message); }
}

async function api(path, method = 'GET') {
  const token = jwt.sign({ userId: 1 }, process.env.JWT_SECRET || 'fallback');
  const res = await fetch(`http://localhost:${PORT}/api${path}`, { method, headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

// On a new paycheck, snapshot savings balances before the user transfers,
// tagged to this specific pay_date. This baseline never moves again once
// set, so verification later in the cycle isn't thrown off by money
// leaving savings to actually pay a bill (see verify.js).
async function recordBaselines(payDate) {
  const user = db.prepare('SELECT plaid_access_token FROM users WHERE id=1').get();
  if (!user?.plaid_access_token) return;
  const accts = (await plaidClient.accountsGet({ access_token: user.plaid_access_token })).data.accounts;
  const ids = new Set([
    process.env.SAVINGS_RENT_ID, process.env.SAVINGS_CAR_INSURANCE_ID,
    process.env.SAVINGS_CC_MIN_ID, process.env.SAVINGS_DEBT_EXTRA_ID,
  ].filter(id => id && id !== 'placeholder'));
  const insert = db.prepare('INSERT OR IGNORE INTO cycle_baselines (user_id, account_id, pay_date, baseline) VALUES (1,?,?,?)');
  for (const id of ids) {
    const acct = accts.find(a => a.account_id === id);
    if (acct) insert.run(id, payDate, acct.balances.current);
  }
}

// Notifies once when a card first flips to overdue, then once per calendar
// day thereafter (on reminder ticks only) for as long as it stays unpaid -
// persistent without spamming 3x/day. Dedup key includes today's date for
// the reminder so each new day gets its own chance to notify.
async function checkCardDueDates(sendReminder) {
  const cards = await api('/cards');
  if (!Array.isArray(cards)) return;
  const todayStr = localISODate(new Date());
  const alreadyNotified = db.prepare('SELECT 1 FROM card_notifications WHERE card_id=? AND occurrence=? AND kind=?');
  const recordNotified = db.prepare('INSERT OR IGNORE INTO card_notifications (card_id, occurrence, kind) VALUES (?,?,?)');
  for (const c of cards) {
    if (c.status === 'overdue') {
      if (!alreadyNotified.get(c.id, c.dateStr, 'overdue')) {
        await notify('Card overdue 🚨', `${c.name}: ${usd(c.minimum)} was due ${c.dateStr} (${c.daysOverdue} day${c.daysOverdue === 1 ? '' : 's'} ago).`, 'high');
        recordNotified.run(c.id, c.dateStr, 'overdue');
      } else if (sendReminder) {
        const reminderKind = `overdue_reminder_${todayStr}`;
        if (!alreadyNotified.get(c.id, c.dateStr, reminderKind)) {
          await notify('Still overdue ⚠️', `${c.name}: ${usd(c.minimum)}, ${c.daysOverdue} days overdue.`, 'high');
          recordNotified.run(c.id, c.dateStr, reminderKind);
        }
      }
    } else if (c.status === 'due_today' && !alreadyNotified.get(c.id, c.dateStr, 'due_today')) {
      await notify('Card due today', `${c.name}: ${usd(c.minimum)} due today.`, 'high');
      recordNotified.run(c.id, c.dateStr, 'due_today');
    }
  }
}

// forceRefresh: skip when Plaid already told us via webhook that fresh data
// is ready (transactionsRefresh is a billed call - no point paying for it
// twice). sendReminder: whether an unfinished transfer should re-notify.
async function tick({ forceRefresh = true, sendReminder = false } = {}) {
  await checkCardDueDates(sendReminder).catch(e => console.error('card due-date check failed:', e.message));
  try {
    if (forceRefresh) {
      const refreshResult = await api('/transactions/force-refresh', 'POST').catch(e => ({ error: e.message }));
      if (refreshResult?.error) console.error('scheduled force-refresh failed:', refreshResult.error, refreshResult.error_code || '');
    }
    const data = await api('/transactions/safe-to-spend');
    if (!data || data.error) return;
    const payDate = data.paycheckDate;
    const transferTotal = data.paycheckAmount - data.discretionaryBudget;

    if (getState('notified_paycheck') !== payDate) {
      await recordBaselines(payDate);
      await notify('Paycheck landed 💰',
        `${usd(data.paycheckAmount)} hit checking on ${payDate}. Transfer ${usd(transferTotal)} to savings. Safe to spend: ${usd(data.safeToSpend)}.`,
        'high');
      setState('notified_paycheck', payDate);
    }

    if (getState('verified_for') !== payDate) {
      const v = await api('/verify/verify-transfers', 'POST');
      const done = v.allGood && Array.isArray(v.details) && v.details.length > 0 && v.details.every(d => d.status === 'Transferred');
      if (done) {
        await notify('Transfers confirmed ✅', `All ${usd(transferTotal)} of bill money is in savings. Your number is clean.`);
        setState('verified_for', payDate);
      } else if (sendReminder) {
        await notify('Transfers not done yet ⚠️', `Move ${usd(transferTotal)} to savings in the Capital One app.`, 'high');
      }
    }

    if (data.safeToSpend < 50 && getState('low_warned_for') !== payDate) {
      await notify(data.safeToSpend < 0 ? 'Over budget 🚨' : 'Running low ⚠️',
        `Safe to spend is ${usd(data.safeToSpend)}. Next payday: ${data.nextPayday}.`, 'high');
      setState('low_warned_for', payDate);
    }
  } catch (e) { console.error('scheduler tick failed:', e.message); }
}

if (TOPIC) {
  // transactionsRefresh is billed per call in production and the free tier
  // is already exhausted, so the scheduler no longer pays for it on its own
  // schedule - it just reads whatever Plaid has (Plaid syncs on its own
  // regardless), which is free. Webhooks (webhook.js) are the real-time
  // path once Funnel is set up; the manual "Refresh from bank" button is
  // still there for an explicit, occasional, user-triggered paid refresh.
  cron.schedule('0 * * * *', () => tick({ forceRefresh: false, sendReminder: false }));
  cron.schedule('5 10,16,20 * * *', () => tick({ forceRefresh: false, sendReminder: true }));
  console.log(`Notifications on: ntfy.sh/${TOPIC} (webhook-driven; hourly fallback poll reads only, no billed refresh)`);
} else {
  console.log('Notifications off: set NTFY_TOPIC in .env to enable');
}

module.exports = { tick };
