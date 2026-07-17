const Database = require('better-sqlite3');
const db = new Database('safe-to-spend.db');
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, plaid_access_token TEXT, plaid_item_id TEXT);
  CREATE TABLE IF NOT EXISTS bills_template (id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT UNIQUE, amount REAL, pay_period TEXT DEFAULT 'biweekly');
  CREATE TABLE IF NOT EXISTS savings_expected (id INTEGER PRIMARY KEY AUTOINCREMENT, savings_account_id TEXT, expected_amount REAL, pay_date TEXT, verified INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS savings_balances (user_id INTEGER, account_id TEXT UNIQUE, last_balance REAL, updated_at TEXT);
  CREATE TABLE IF NOT EXISTS transactions_cache (id INTEGER PRIMARY KEY AUTOINCREMENT, pay_period_start TEXT, safe_to_spend REAL, total_spent REAL, created_at TEXT);
  CREATE TABLE IF NOT EXISTS reimbursements (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, transaction_id TEXT UNIQUE, name TEXT, amount REAL, date TEXT, received INTEGER DEFAULT 0, flagged_at TEXT DEFAULT (datetime('now')), received_at TEXT);
  CREATE TABLE IF NOT EXISTS cycle_baselines (user_id INTEGER, account_id TEXT, pay_date TEXT, baseline REAL, PRIMARY KEY (user_id, account_id, pay_date));
  CREATE TABLE IF NOT EXISTS verified_transfers (user_id INTEGER, pay_date TEXT, account_id TEXT, verified_at TEXT, PRIMARY KEY (user_id, pay_date, account_id));
  CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS cycle_history (user_id INTEGER, pay_date TEXT, paycheck_amount REAL, discretionary_budget REAL, total_spent REAL, safe_to_spend REAL, updated_at TEXT, PRIMARY KEY (user_id, pay_date));
  CREATE TABLE IF NOT EXISTS credit_cards (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, name TEXT, minimum REAL, due_day INTEGER, created_at TEXT DEFAULT (datetime('now')));
`);

// Marks a bill as auto-paying directly from checking (e.g. a subscription
// on autopay) rather than being transferred to savings and paid from there.
// When set, the matching checking charge is excluded from "spending" (it's
// already accounted for via the reduced discretionary budget) and the bill
// is skipped by the savings-transfer checklist/verification entirely.
try { db.exec('ALTER TABLE bills_template ADD COLUMN match_name TEXT'); } catch (e) { /* column already exists */ }
try { db.exec('ALTER TABLE credit_cards ADD COLUMN last_paid TEXT'); } catch (e) { /* column already exists */ }

// One-time fixup: an earlier version of the cycle_baselines migration logic
// carried forward the old ratcheting system's already-corrupted value as a
// numeric baseline instead of treating it as proof-of-completion. Wipe the
// (still very new, not-yet-relied-on) rows it wrote so the corrected logic
// in verify.js gets a clean slate on next use. Runs at most once.
if (!db.prepare('SELECT 1 FROM migrations WHERE name=?').get('reset_cycle_baselines_v1')) {
  db.exec('DELETE FROM cycle_baselines; DELETE FROM verified_transfers;');
  db.prepare('INSERT INTO migrations (name) VALUES (?)').run('reset_cycle_baselines_v1');
}

if (db.prepare('SELECT COUNT(*) AS c FROM bills_template').get().c === 0) {
  const ins = db.prepare('INSERT INTO bills_template (category, amount) VALUES (?,?)');
  for (const [category, amount] of [
    ['Rent', 718], ['Tesla', 430], ['Insurance', 115], ['Electricity', 90],
    ['Credit Card Minimums', 475], ['Extra Debt Payment', 750],
  ]) ins.run(category, amount);
}

// Real recurring charge (Tesla FSD) that auto-drafts from checking instead
// of getting transferred to savings - see match_name comment above. Runs
// after the defaults so it doesn't short-circuit the "seed if empty" check.
if (!db.prepare('SELECT 1 FROM migrations WHERE name=?').get('add_tesla_fsd_bill')) {
  if (!db.prepare('SELECT 1 FROM bills_template WHERE category=?').get('Tesla FSD')) {
    db.prepare('INSERT INTO bills_template (category, amount, match_name) VALUES (?,?,?)').run('Tesla FSD', 100, 'TESLA SUBSCRIPTION');
  }
  db.prepare('INSERT INTO migrations (name) VALUES (?)').run('add_tesla_fsd_bill');
}

// $51 chronically undershot the real bill (Texas summer AC - actual came in
// at $101.99). $90 leaves a bit of buffer for cooler months rather than
// just matching the one hot-month data point exactly.
if (!db.prepare('SELECT 1 FROM migrations WHERE name=?').get('bump_electricity_budget_v1')) {
  db.prepare('UPDATE bills_template SET amount=? WHERE category=?').run(90, 'Electricity');
  db.prepare('INSERT INTO migrations (name) VALUES (?)').run('bump_electricity_budget_v1');
}

// Real card minimums/due dates worked out by hand in conversation - saving
// them so future cycles don't require reconstructing this from scratch.
// AMEX and Robinhood's due dates are unknown (due_day left null) - only
// known as already-paid this cycle.
if (!db.prepare('SELECT 1 FROM migrations WHERE name=?').get('seed_credit_cards_v1')) {
  const ins = db.prepare('INSERT INTO credit_cards (user_id, name, minimum, due_day) VALUES (1,?,?,?)');
  for (const [name, minimum, due_day] of [
    ['AMEX', 128.11, null],
    ['Robinhood', 108, null],
    ['SavorOne', 54, 16],
    ['Amazon', 344, 18],
    ['Citi', 70, 24],
    ['Quicksilver (4k)', 150, 27],
    ['Quicksilver (small)', 30, 5],
  ]) ins.run(name, minimum, due_day);
  db.prepare('INSERT INTO migrations (name) VALUES (?)').run('seed_credit_cards_v1');
}

module.exports = db;
