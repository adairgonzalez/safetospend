// Shared card due-date logic: used by the /api/cards response, the
// Insights "due before payday" list, and the scheduler's overdue
// notifications, so all three always agree on what "overdue" means.

function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function occurrenceInMonth(year, month, dueDay) {
  return new Date(year, month, Math.min(dueDay, daysInMonth(year, month)));
}
function localMidnight(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

// The due-day occurrence <= today (could be today itself).
function mostRecentOccurrence(dueDay, today) {
  let y = today.getFullYear(), m = today.getMonth();
  let candidate = occurrenceInMonth(y, m, dueDay);
  if (candidate > today) {
    m -= 1; if (m < 0) { m = 11; y -= 1; }
    candidate = occurrenceInMonth(y, m, dueDay);
  }
  return candidate;
}

// The due-day occurrence >= today (could be today itself).
function nextOccurrence(dueDay, today) {
  let y = today.getFullYear(), m = today.getMonth();
  let candidate = occurrenceInMonth(y, m, dueDay);
  if (candidate < today) {
    m += 1; if (m > 11) { m = 0; y += 1; }
    candidate = occurrenceInMonth(y, m, dueDay);
  }
  return candidate;
}

function localISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// { status: 'unknown'|'upcoming'|'due_today'|'overdue', date, dateStr, daysOverdue? }
// A card counts as handled for its current occurrence the moment last_paid
// is on or after that occurrence's due date - paying early (like Robinhood
// on 7/10 for an 18th due date) still counts, it doesn't wait for the date
// to arrive to be considered "paid".
function getCardStatus(card, now = new Date()) {
  const today = localMidnight(now);
  if (!card.due_day) return { status: 'unknown', date: null, dateStr: null };

  const lastDue = mostRecentOccurrence(card.due_day, today);

  // An occurrence that fell before this card was even added to tracking
  // can't be flagged overdue - we have no last_paid record for it because
  // we weren't watching yet, not because it was missed. Without this, any
  // card added with a due date later this month (e.g. added the 16th, due
  // the 18th) looks back to last month's unrecorded occurrence and reports
  // it as weeks overdue on day one.
  const trackingStart = card.created_at ? localMidnight(new Date(card.created_at)) : null;
  const untracked = trackingStart && lastDue < trackingStart;
  const paidSinceLastDue = untracked || (card.last_paid && localMidnight(new Date(card.last_paid)) >= lastDue);

  if (paidSinceLastDue) {
    const next = nextOccurrence(card.due_day, today);
    if (next.getTime() === today.getTime()) return { status: 'due_today', date: next, dateStr: localISODate(next) };
    return { status: 'upcoming', date: next, dateStr: localISODate(next) };
  }
  if (lastDue.getTime() === today.getTime()) {
    return { status: 'due_today', date: lastDue, dateStr: localISODate(lastDue) };
  }
  const daysOverdue = Math.round((today - lastDue) / 86400000);
  return { status: 'overdue', date: lastDue, dateStr: localISODate(lastDue), daysOverdue };
}

module.exports = { getCardStatus, mostRecentOccurrence, nextOccurrence, localMidnight, localISODate };
