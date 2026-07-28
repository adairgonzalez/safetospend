// Whether a bill's real-world due date actually falls in this pay cycle -
// shared by /safe-to-spend (what to set aside/show on the checklist) and
// verify-transfers (what a savings account is expected to hold), so they
// never disagree about which bills are "live" this cycle.
const { nextOccurrence, localDateFromISO, localISODate, addDaysISO } = require('./cardStatus');

function nextPaydayFrom(payDate) {
  return addDaysISO(payDate, 14);
}

// Bills without a due_day are always active (the pre-due-date-aware
// behavior) - covers categories like "Credit Card Minimums" or "Extra Debt
// Payment" that aren't tied to one fixed calendar day, and any bill the
// user hasn't assigned a due date to yet.
function isBillActiveThisCycle(bill, payDate, nextPayday) {
  if (!bill.due_day) return true;
  const occurrence = nextOccurrence(bill.due_day, localDateFromISO(payDate));
  return occurrence < localDateFromISO(nextPayday);
}

// The bill's next due date on/after payDate, as 'YYYY-MM-DD' - null for a
// bill with no due_day set (nothing single to point at).
function nextBillDueDate(bill, payDate) {
  if (!bill.due_day) return null;
  return localISODate(nextOccurrence(bill.due_day, localDateFromISO(payDate)));
}

module.exports = { nextPaydayFrom, isBillActiveThisCycle, nextBillDueDate };
