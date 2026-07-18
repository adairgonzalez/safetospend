// Avalanche method: put every extra dollar toward the highest-APR balance
// first (fully clearing it if the pool allows), then roll remaining dollars
// to the next-highest APR card, and so on. This minimizes total interest
// paid for a fixed one-time extra payment, which is the standard result for
// debt payoff ordering. Cards with no APR on file are assumed costliest
// (sorted first) so the plan stays conservative rather than silently
// deprioritizing debt the user hasn't entered a rate for.
//
// A card's balance isn't always uniform - promotional 0% APR installment
// plans (e.g. Amazon/Synchrony's "6 equal monthly payments") don't cost
// anything in interest no matter when they're paid off, so promo_balance
// splits that portion out into its own zero-APR "debt" that naturally
// sorts dead last (below every card with a real rate, known or not).
export function computeDebtPlan(cards, leftover) {
  const pool = Math.max(0, Math.floor((leftover || 0) * 100) / 100);
  const debts = [];
  for (const c of (cards || [])) {
    if (typeof c.balance !== 'number' || c.balance <= 0) continue;
    const promo = typeof c.promo_balance === 'number' ? Math.min(c.promo_balance, c.balance) : 0;
    const regular = c.balance - promo;
    if (regular > 0) debts.push({ id: c.id, name: c.name, balance: regular, apr: typeof c.apr === 'number' ? c.apr : null, promo: false });
    if (promo > 0) debts.push({ id: c.id, name: c.name, balance: promo, apr: 0, promo: true });
  }
  debts.sort((a, b) => {
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
    if (amount > 0) allocations.push({ id: d.id, name: d.name, apr: d.apr, promo: d.promo, amount, payoff: amount >= d.balance });
    remaining -= amount;
  }

  const totalDebt = debts.reduce((s, d) => s + d.balance, 0);
  const missingApr = debts.some(d => d.apr == null);

  return { debts, allocations, pool, unallocated: remaining, totalDebt, missingApr };
}
