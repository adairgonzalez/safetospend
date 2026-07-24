const usd = (n) => (typeof n === 'number' ? n : 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const dayMs = 86400000;

// Date objects representing a civil calendar date (today) must format using
// local fields - .toISOString() converts to UTC first, which silently shows
// tomorrow's date once evening rolls past UTC midnight in any timezone
// behind UTC (all of North America).
const localISODate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const cardStatusLabel = (c) => {
  if (c.status === 'overdue') return `${c.daysOverdue} day${c.daysOverdue === 1 ? '' : 's'} overdue`;
  if (c.status === 'due_today') return 'due today';
  if (c.status === 'upcoming') return `due ${c.dateStr}`;
  return 'due date unknown';
};

// Builds the same plain-text financial snapshot used by Insights' "Copy
// summary for AI" button and the in-app AI chat/auditor - one source of
// truth for what "the current financial picture" means, so all three
// present identical numbers.
export function buildFinancialSummary({ data, verify, history, billsAccounts, cards }) {
  const today = new Date();
  const payDate = new Date(data.paycheckDate);
  const nextPayday = new Date(data.nextPayday);
  const daysElapsed = Math.max(1, Math.round((today - payDate) / dayMs));
  const daysTotal = Math.max(1, Math.round((nextPayday - payDate) / dayMs));
  const daysLeft = Math.max(0, Math.round((nextPayday - today) / dayMs));

  const spendRate = data.totalSpent / daysElapsed;
  const budgetPaceRate = data.discretionaryBudget / daysTotal;
  const projectedSpend = spendRate * daysTotal;
  const projectedSafe = data.discretionaryBudget - projectedSpend;
  const expectedByNow = budgetPaceRate * daysElapsed;
  const paceStatus = data.totalSpent > expectedByNow * 1.1 ? 'behind'
    : data.totalSpent < expectedByNow * 0.9 ? 'ahead' : 'onTrack';
  const paceLabel = { behind: 'Spending faster than budget pace', ahead: 'Spending slower than budget pace', onTrack: 'Right on budget pace' }[paceStatus];

  const topExpenses = [...(data.spending || [])].sort((a, b) => b.amount - a.amount).slice(0, 8);

  const cardsDueSoon = (cards || [])
    .filter(c => c.status === 'overdue' || c.status === 'due_today' || (c.status === 'upcoming' && c.dateStr && c.dateStr <= data.nextPayday))
    .sort((a, b) => (a.dateStr || '').localeCompare(b.dateStr || ''));
  const overdueCards = cardsDueSoon.filter(c => c.status === 'overdue');
  const dueSoonTotal = cardsDueSoon.reduce((s, c) => s + c.minimum, 0);

  const billsBalance = billsAccounts?.[0]?.balance ?? null;
  const availableBuffer = billsBalance != null ? billsBalance - dueSoonTotal : null;

  const lines = [];
  lines.push(`SAFE TO SPEND — Financial Snapshot (${localISODate(today)})`);
  lines.push('');
  lines.push(`Pay cycle: ${data.paycheckDate} → ${data.nextPayday} (day ${daysElapsed} of ${daysTotal}, ${daysLeft} left)`);
  lines.push(`Paycheck: ${usd(data.paycheckAmount)}`);
  lines.push(`Bills set aside: ${usd(data.paycheckAmount - data.discretionaryBudget)}`);
  lines.push(`Spent so far: ${usd(data.totalSpent)}`);
  lines.push(`Safe to spend right now: ${usd(data.safeToSpend)}`);
  if (data.carryoverDeficit < 0) lines.push(`(includes ${usd(data.carryoverDeficit)} carried over from last cycle's shortfall)`);
  lines.push('');
  lines.push(`Pace: ${usd(spendRate)}/day so far vs ${usd(budgetPaceRate)}/day budget pace — ${paceLabel}`);
  lines.push(`Projected total spend by payday at this rate: ${usd(projectedSpend)}`);
  lines.push(`Projected safe-to-spend at next payday: ${usd(projectedSafe)}`);
  if (verify?.details?.length) {
    lines.push('');
    lines.push('Bills status:');
    verify.details.forEach(d => lines.push(`- ${d.category}: ${d.status}`));
  }
  if (topExpenses.length) {
    lines.push('');
    lines.push('Biggest expenses this cycle:');
    topExpenses.forEach((t, i) => lines.push(`${i + 1}. ${t.name} — ${usd(t.amount)} (${t.date})`));
  }
  if ((cards || []).length) {
    lines.push('');
    lines.push('Credit cards on file:');
    cards.forEach(c => {
      const parts = [`min ${usd(c.minimum)}`, cardStatusLabel(c)];
      if (c.balance != null) parts.push(`balance ${usd(c.balance)}`);
      if (c.apr != null) parts.push(`${c.apr}% APR`);
      if (c.promo_balance) parts.push(`${usd(c.promo_balance)} at 0% promo`);
      if (c.closed) parts.push('closed');
      lines.push(`- ${c.name}: ${parts.join(', ')}`);
    });
  }
  if (overdueCards.length) {
    lines.push('');
    lines.push('OVERDUE cards:');
    overdueCards.forEach(c => lines.push(`- ${c.name}: ${usd(c.minimum)}, ${c.daysOverdue} day(s) overdue`));
  }
  if (billsBalance != null) {
    lines.push('');
    lines.push(`Bills and Debt balance: ${usd(billsBalance)} — reserved for cards due before payday: ${usd(dueSoonTotal)} — available buffer: ${usd(availableBuffer)}`);
  }
  if (data.reimbursements?.length) {
    lines.push('');
    lines.push('Reimbursements:');
    data.reimbursements.forEach(r => lines.push(`- ${r.name} — ${usd(r.amount)} (${r.received ? 'received' : 'pending'})`));
  }
  if (history?.length) {
    lines.push('');
    lines.push('Recent past cycles:');
    history.forEach(h => lines.push(`- ${h.pay_date}: paycheck ${usd(h.paycheck_amount)}, spent ${usd(h.total_spent)}, ended with ${usd(h.safe_to_spend)} safe to spend`));
  }
  (billsAccounts || []).forEach(acct => {
    lines.push('');
    lines.push(`${acct.name}${acct.mask ? ` (…${acct.mask})` : ''} — current balance ${usd(acct.balance)}:`);
    acct.activity.slice(0, 15).forEach(t => {
      lines.push(`- ${t.date}: ${t.name} ${t.amount >= 0 ? '+' : ''}${usd(t.amount)}${t.isIncomingTransfer ? ' (transfer in)' : ''}`);
    });
  });
  return lines.join('\n');
}
