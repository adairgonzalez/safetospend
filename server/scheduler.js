const cron = require('node-cron');
const jwt = require('jsonwebtoken');
const db = require('./db');
const plaidClient = require('./plaidClient');

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
// so verification measures the increase from payday onward even if money
// was paid out of savings during the previous cycle.
async function recordBaselines() {
  const user = db.prepare('SELECT plaid_access_token FROM users WHERE id=1').get();
  if (!user?.plaid_access_token) return;
  const accts = (await plaidClient.accountsGet({ access_token: user.plaid_access_token })).data.accounts;
  const ids = new Set([
    process.env.SAVINGS_RENT_ID, process.env.SAVINGS_CAR_INSURANCE_ID,
    process.env.SAVINGS_CC_MIN_ID, process.env.SAVINGS_DEBT_EXTRA_ID,
  ].filter(id => id && id !== 'placeholder'));
  const upsert = db.prepare("INSERT OR REPLACE INTO savings_balances (user_id, account_id, last_balance, updated_at) VALUES (1,?,?,datetime('now'))");
  for (const id of ids) {
    const acct = accts.find(a => a.account_id === id);
    if (acct) upsert.run(id, acct.balances.current);
  }
}

async function tick(sendReminder) {
  try {
    // Ask Plaid to pull fresh data from the bank before reading it, so
    // spending shows up without the user having to open the app and tap
    // Refresh. This costs a Plaid API call each run, hence every 30 min
    // rather than something tighter.
    const refreshResult = await api('/transactions/force-refresh', 'POST').catch(e => ({ error: e.message }));
    if (refreshResult?.error) console.error('scheduled force-refresh failed:', refreshResult.error, refreshResult.error_code || '');
    const data = await api('/transactions/safe-to-spend');
    if (!data || data.error) return;
    const payDate = data.paycheckDate;
    const transferTotal = data.paycheckAmount - data.discretionaryBudget;

    if (getState('notified_paycheck') !== payDate) {
      await recordBaselines();
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
  cron.schedule('*/30 * * * *', () => tick(false));
  cron.schedule('5 10,16,20 * * *', () => tick(true));
  console.log(`Notifications on: ntfy.sh/${TOPIC} (checking every 30 min)`);
} else {
  console.log('Notifications off: set NTFY_TOPIC in .env to enable');
}

module.exports = { tick };
