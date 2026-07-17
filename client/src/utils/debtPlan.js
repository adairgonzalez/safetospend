// Avalanche method: put every extra dollar toward the highest-APR balance
// first (fully clearing it if the pool allows), then roll remaining dollars
// to the next-highest APR card, and so on. This minimizes total interest
// paid for a fixed one-time extra payment, which is the standard result for
// debt payoff ordering. Cards with no APR on file are assumed costliest
// (sorted first) so the plan stays conservative rather than silently
// deprioritizing debt the user hasn't entered a rate for.
export function computeDebtPlan(cards, leftover) {
  const pool = Math.max(0, Math.floor((leftover || 0) * 100) / 100);
  const debts = (cards || [])
    .filter(c => typeof c.balance === 'number' && c.balance > 0)
    .map(c => ({ id: c.id, name: c.name, balance: c.balance, apr: typeof c.apr === 'number' ? c.apr : null }))
    .sort((a, b) => {
      const aApr = a.apr == null ? Infinity : a.apr;
      const bApr = b.apr == null ? Infinity : b.apr;
      if (aApr !== bApr) return bApr - aApr;
      return b.balance - a.balance;
    });

  let remaining = pool;
  const allocations = [];
  for (const d of debts) {
    if (remaining <= 0) break;
    const amount = Math.min(remaining, d.balance);
    if (amount > 0) allocations.push({ id: d.id, name: d.name, apr: d.apr, amount, payoff: amount >= d.balance });
    remaining -= amount;
  }

  const totalDebt = debts.reduce((s, d) => s + d.balance, 0);
  const missingApr = debts.some(d => d.apr == null);

  return { debts, allocations, pool, unallocated: remaining, totalDebt, missingApr };
}
