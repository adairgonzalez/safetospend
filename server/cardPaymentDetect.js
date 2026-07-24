const { getCardStatus, mostRecentOccurrence, localMidnight, localISODate } = require('./cardStatus');

// Cards themselves were never connected through Plaid (only the checking/
// savings accounts are), so there's no dedicated feed to check a card's
// payment status against. Instead, match outgoing checking transactions by
// name (same match_name pattern already used for autopay bills) - a debit
// matching a card's name, dated on or after that card's current due
// occurrence, counts as proof it's been paid, exactly like tapping
// "Mark paid" by hand would. Compares dates as plain 'YYYY-MM-DD' strings
// (never via `new Date(...)` equality) to avoid the UTC-parsing shift that's
// bitten this codebase before.
function detectCardPayments(txns, cards, now = new Date()) {
  const today = localMidnight(now);
  const paidIds = [];
  for (const card of cards) {
    if (!card.match_name || !card.due_day) continue;
    if (getCardStatus(card, now).status === 'upcoming') continue; // already covered

    const lastDueStr = localISODate(mostRecentOccurrence(card.due_day, today));
    const matcher = card.match_name.toUpperCase();
    const hasPayment = txns.some(t =>
      !t.pending && t.amount > 0 &&
      (t.name || '').toUpperCase().includes(matcher) &&
      t.date >= lastDueStr
    );
    if (hasPayment) paidIds.push(card.id);
  }
  return paidIds;
}

module.exports = { detectCardPayments };
