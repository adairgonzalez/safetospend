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
  CREATE TABLE IF NOT EXISTS card_notifications (card_id INTEGER, occurrence TEXT, kind TEXT, notified_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (card_id, occurrence, kind));
  CREATE TABLE IF NOT EXISTS ai_chats (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, title TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS ai_chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id INTEGER, role TEXT, content TEXT, created_at TEXT DEFAULT (datetime('now')));
`);

// Marks a bill as auto-paying directly from checking (e.g. a subscription
// on autopay) rather than being transferred to savings and paid from there.
// When set, the matching checking charge is excluded from "spending" (it's
// already accounted for via the reduced discretionary budget) and the bill
// is skipped by the savings-transfer checklist/verification entirely.
try { db.exec('ALTER TABLE bills_template ADD COLUMN match_name TEXT'); } catch (e) { /* column already exists */ }
try { db.exec('ALTER TABLE credit_cards ADD COLUMN last_paid TEXT'); } catch (e) { /* column already exists */ }
try { db.exec('ALTER TABLE credit_cards ADD COLUMN balance REAL'); } catch (e) { /* column already exists */ }
try { db.exec('ALTER TABLE credit_cards ADD COLUMN apr REAL'); } catch (e) { /* column already exists */ }
try { db.exec('ALTER TABLE credit_cards ADD COLUMN credit_limit REAL'); } catch (e) { /* column already exists */ }
try { db.exec('ALTER TABLE credit_cards ADD COLUMN closed INTEGER DEFAULT 0'); } catch (e) { /* column already exists */ }
try { db.exec('ALTER TABLE credit_cards ADD COLUMN promo_balance REAL'); } catch (e) { /* column already exists */ }
try { db.exec('ALTER TABLE credit_cards ADD COLUMN match_name TEXT'); } catch (e) { /* column already exists */ }
// Day of month a bill is actually due (1-31). Unset (NULL) means "every
// cycle" - the old behavior - so existing bills keep working until the
// user assigns a real due date via the bill template page.
try { db.exec('ALTER TABLE bills_template ADD COLUMN due_day INTEGER'); } catch (e) { /* column already exists */ }

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

// AMEX is paid off and closed - no longer a recurring obligation. Robinhood's
// real due day is the 18th (it was paid on 7/10, ahead of schedule, so mark
// it as handled for the current cycle to avoid double-flagging it as due).
if (!db.prepare('SELECT 1 FROM migrations WHERE name=?').get('update_credit_cards_v2')) {
  db.prepare("DELETE FROM credit_cards WHERE name=?").run('AMEX');
  db.prepare("UPDATE credit_cards SET due_day=18, last_paid=datetime('now') WHERE name=?").run('Robinhood');
  db.prepare('INSERT INTO migrations (name) VALUES (?)').run('update_credit_cards_v2');
}

// Named distinctly from the existing 'JPMorgan Chase' Bills-and-Debt
// transaction (that one's the Tesla auto loan, $868.15) - this is a
// separate Chase credit card. Due day 12th already passed this cycle;
// last_paid left unset since it's unconfirmed whether it's been paid.
if (!db.prepare('SELECT 1 FROM migrations WHERE name=?').get('add_chase_card_v1')) {
  if (!db.prepare('SELECT 1 FROM credit_cards WHERE name=?').get('Chase (credit card)')) {
    db.prepare('INSERT INTO credit_cards (user_id, name, minimum, due_day) VALUES (1,?,?,?)').run('Chase (credit card)', 104, 12);
  }
  db.prepare('INSERT INTO migrations (name) VALUES (?)').run('add_chase_card_v1');
}

// Statement confirms the real minimum is $105 (not the $104 estimate), and
// the 7/12 autopay attempt bounced (still linked to checking) but a manual
// 7/15 payment succeeded with no further return - Chase considers this
// cycle's payment settled, so mark it paid even though which of the two
// accounts actually funded it is still being confirmed.
if (!db.prepare('SELECT 1 FROM migrations WHERE name=?').get('confirm_chase_card_paid_v1')) {
  db.prepare("UPDATE credit_cards SET minimum=?, last_paid=datetime('now') WHERE name=?").run(105, 'Chase (credit card)');
  db.prepare('INSERT INTO migrations (name) VALUES (?)').run('confirm_chase_card_paid_v1');
}

// Tesla Insurance ($224-251/mo, ~ due the 29th) charges a Discover card tied
// to checking, not a separate revolving card - same autopay pattern as
// Tesla FSD. Match string is a best guess (no real transaction has posted
// yet this cycle to confirm the exact name Plaid will show); correct it
// once the Jul 29 charge actually appears if it doesn't match.
if (!db.prepare('SELECT 1 FROM migrations WHERE name=?').get('mark_insurance_autopay_v1')) {
  db.prepare('UPDATE bills_template SET match_name=? WHERE category=?').run('TESLA INSURANCE', 'Insurance');
  db.prepare('INSERT INTO migrations (name) VALUES (?)').run('mark_insurance_autopay_v1');
}

// Real balances/APRs/limits worked out by hand in conversation, needed to
// drive the avalanche-method debt payoff suggestion on the dashboard.
// Amazon's APR and limit weren't provided - left null (still contributes
// its balance to "total debt" but is naturally sorted last in the payoff
// order behind every card with a known rate).
if (!db.prepare('SELECT 1 FROM migrations WHERE name=?').get('seed_card_balances_apr_v1')) {
  const upd = db.prepare('UPDATE credit_cards SET balance=?, apr=?, credit_limit=? WHERE name=?');
  for (const [name, balance, apr, limit] of [
    ['SavorOne', 2169, 28.24, 3500],
    ['Citi', 2200, 26.49, 2210],
    ['Quicksilver (4k)', 4898, 28.24, 5000],
    ['Quicksilver (small)', 868, 28.99, 1000],
    ['Chase (credit card)', 10500, 27.74, 12000],
    ['Robinhood', 3000, 29.24, 5000],
    ['Amazon', 2464, null, null],
  ]) upd.run(balance, apr, limit, name);
  db.prepare('INSERT INTO migrations (name) VALUES (?)').run('seed_card_balances_apr_v1');
}

// Amazon card is closed (no longer accepting new charges) but still carries
// a balance - unlike AMEX (paid off and closed, so deleted entirely), this
// one keeps its minimum/due date and stays in the debt payoff plan since
// the $2464 still has to be paid down.
if (!db.prepare('SELECT 1 FROM migrations WHERE name=?').get('mark_amazon_closed_v1')) {
  db.prepare('UPDATE credit_cards SET closed=1 WHERE name=?').run('Amazon');
  db.prepare('INSERT INTO migrations (name) VALUES (?)').run('mark_amazon_closed_v1');
}

// The last cycle's recorded safe_to_spend was captured while several bugs
// in the spending/checklist calculation were still being found and fixed
// (autopay matching, card-payment detection, etc.) - not trustworthy enough
// to carry forward as next cycle's starting deficit. Zero out any negative
// safe_to_spend already on record so nothing carries forward from that
// period; paycheck/spending totals are left alone so the Insights trend
// view still shows real history, just not treated as an unpaid deficit.
if (!db.prepare('SELECT 1 FROM migrations WHERE name=?').get('clear_stale_carryover_deficit_v1')) {
  db.prepare('UPDATE cycle_history SET safe_to_spend=0 WHERE safe_to_spend < 0').run();
  db.prepare('INSERT INTO migrations (name) VALUES (?)').run('clear_stale_carryover_deficit_v1');
}

// Amazon's $2464 balance isn't uniform: per the Synchrony statement, $900.45
// sits in "6 equal monthly payments, 0% APR" promo plans (paying that down
// early saves zero interest), and the rest accrues at the card's real
// 29.99% APR. promo_balance lets the payoff plan split a card's balance
// into an interest-bearing portion and a zero-interest portion instead of
// treating the whole thing as one APR.
if (!db.prepare('SELECT 1 FROM migrations WHERE name=?').get('seed_amazon_apr_promo_v1')) {
  db.prepare('UPDATE credit_cards SET apr=?, promo_balance=? WHERE name=?').run(29.99, 900.45, 'Amazon');
  db.prepare('INSERT INTO migrations (name) VALUES (?)').run('seed_amazon_apr_promo_v1');
}

module.exports = db;
