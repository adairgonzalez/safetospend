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
`);

if (db.prepare('SELECT COUNT(*) AS c FROM bills_template').get().c === 0) {
  const ins = db.prepare('INSERT INTO bills_template (category, amount) VALUES (?,?)');
  for (const [category, amount] of [
    ['Rent', 718], ['Tesla', 430], ['Insurance', 115], ['Electricity', 51],
    ['Credit Card Minimums', 475], ['Extra Debt Payment', 750],
  ]) ins.run(category, amount);
}

module.exports = db;
