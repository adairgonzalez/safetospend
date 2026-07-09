const PAYCHECK_KEYWORDS = ['PAYROLL', 'DIRECT DEP', 'DEPOSIT'];

// True for internal transfers (e.g. bill money moving to savings), which
// must never be double-counted as spending or income.
function isTransfer(t) {
  const pfc = t.personal_finance_category?.primary || '';
  if (pfc === 'TRANSFER_IN' || pfc === 'TRANSFER_OUT') return true;
  const legacy = (t.category || []).join(' ').toUpperCase();
  if (legacy.includes('TRANSFER')) return true;
  return (t.name || '').toUpperCase().includes('TRANSFER');
}

function hasPinnedPaycheckAccount() {
  return !!(process.env.PAYCHECK_ACCOUNT_ID && process.env.PAYCHECK_ACCOUNT_ID !== 'placeholder');
}

// Plaid amounts: positive = money out, negative = money in. Paychecks are
// negative. A pinned account is a strong enough signal on its own (employer
// names rarely contain PAYROLL/DEPOSIT); only fall back to the keyword list
// when no account is pinned, where amount range alone would be too loose.
function detectPaycheck(txns) {
  const pinned = hasPinnedPaycheckAccount();
  const paychecks = txns.filter(t => {
    if (pinned && t.account_id !== process.env.PAYCHECK_ACCOUNT_ID) return false;
    const deposit = -t.amount;
    if (!(deposit > 1000 && deposit < 5000)) return false;
    return pinned || PAYCHECK_KEYWORDS.some(k => (t.name || '').toUpperCase().includes(k));
  }).sort((a, b) => new Date(b.date) - new Date(a.date));
  return paychecks[0] || null;
}

module.exports = { isTransfer, detectPaycheck, hasPinnedPaycheckAccount, PAYCHECK_KEYWORDS };
