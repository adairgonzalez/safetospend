const Database = require('better-sqlite3');
const db = new Database('safe-to-spend.db');
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, plaid_access_token TEXT, plaid_item_id TEXT);
  CREATE TABLE IF NOT EXISTS bills_template (id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT UNIQUE, amount REAL, pay_period TEXT DEFAULT 'biweekly');
  CREATE TABLE IF NOT EXISTS savings_expected (id INTEGER PRIMARY KEY AUTOINCREMENT, savings_account_id TEXT, expected_amount REAL, pay_date TEXT, verified INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS savings_balances (user_id INTEGER, account_id TEXT UNIQUE, last_balance REAL, updated_at TEXT);
  CREATE TABLE IF NOT EXISTS transactions_cache (id INTEGER PRIMARY KEY AUTOINCREMENT, pay_period_start TEXT, safe_to_spend REAL, total_spent REAL, created_at TEXT);
`);
module.exports = db;
