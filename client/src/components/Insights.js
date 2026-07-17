import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const usd = (n) => (typeof n === 'number' ? n : 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const dayMs = 86400000;

function nextDueDate(dueDay) {
  if (!dueDay) return null;
  const today = new Date();
  const clamp = (y, m) => Math.min(dueDay, new Date(y, m + 1, 0).getDate());
  let year = today.getFullYear(), month = today.getMonth();
  let candidate = new Date(year, month, clamp(year, month));
  if (candidate < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
    month += 1;
    if (month > 11) { month = 0; year += 1; }
    candidate = new Date(year, month, clamp(year, month));
  }
  return candidate;
}

export default function Insights({ token }) {
  const [data, setData] = useState(null);
  const [verify, setVerify] = useState(null);
  const [history, setHistory] = useState([]);
  const [billsAccounts, setBillsAccounts] = useState([]);
  const [cards, setCards] = useState([]);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch('/api/transactions/safe-to-spend', { headers }).then(r => r.json()),
      fetch('/api/verify/verify-transfers', { method: 'POST', headers }).then(r => r.json()).catch(() => null),
      fetch('/api/insights/history', { headers }).then(r => r.json()).catch(() => ({ history: [] })),
      fetch('/api/insights/bills-account', { headers }).then(r => r.json()).catch(() => ({ accounts: [] })),
      fetch('/api/cards', { headers }).then(r => r.json()).catch(() => []),
    ]).then(([sts, v, h, b, c]) => {
      if (sts.error) { setError(sts.error); return; }
      setData(sts);
      setVerify(v);
      setHistory(h.history || []);
      setBillsAccounts(b.accounts || []);
      setCards(Array.isArray(c) ? c : []);
    }).catch(e => setError(e.message));
  }, [token]);

  if (error) return (
    <div className="container">
      <div className="topbar"><div className="brand"><span className="brand-dot" />Insights</div><Link to="/dashboard" className="btn btn-ghost btn-sm">Back</Link></div>
      <div className="card empty"><p>{error}</p></div>
    </div>
  );
  if (!data) return (
    <div className="container">
      <div className="topbar"><div className="brand"><span className="brand-dot" />Insights</div><Link to="/dashboard" className="btn btn-ghost btn-sm">Back</Link></div>
      <p className="muted center">Loading…</p>
    </div>
  );

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
  const paceTone = { behind: 'bad', ahead: 'good', onTrack: 'warn' }[paceStatus];

  const topExpenses = [...(data.spending || [])].sort((a, b) => b.amount - a.amount).slice(0, 8);

  const cardsDueSoon = cards
    .map(c => ({ ...c, next: nextDueDate(c.due_day) }))
    .filter(c => c.next && c.next <= nextPayday)
    .sort((a, b) => a.next - b.next);
  const dueSoonTotal = cardsDueSoon.reduce((s, c) => s + c.minimum, 0);
  const unknownDueDate = cards.filter(c => !c.due_day);

  const buildSummary = () => {
    const lines = [];
    lines.push(`SAFE TO SPEND — Financial Snapshot (${today.toISOString().slice(0, 10)})`);
    lines.push('');
    lines.push(`Pay cycle: ${data.paycheckDate} → ${data.nextPayday} (day ${daysElapsed} of ${daysTotal}, ${daysLeft} left)`);
    lines.push(`Paycheck: ${usd(data.paycheckAmount)}`);
    lines.push(`Bills set aside: ${usd(data.paycheckAmount - data.discretionaryBudget)}`);
    lines.push(`Spent so far: ${usd(data.totalSpent)}`);
    lines.push(`Safe to spend right now: ${usd(data.safeToSpend)}`);
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
    if (cardsDueSoon.length) {
      lines.push('');
      lines.push(`Card minimums due before next payday (${data.nextPayday}) — total ${usd(dueSoonTotal)}:`);
      cardsDueSoon.forEach(c => lines.push(`- ${c.name}: ${usd(c.minimum)}, due ${c.next.toISOString().slice(0, 10)}`));
    }
    if (data.reimbursements?.length) {
      lines.push('');
      lines.push('Reimbursements:');
      data.reimbursements.forEach(r => lines.push(`- ${r.name} — ${usd(r.amount)} (${r.received ? 'received' : 'pending'})`));
    }
    if (history.length) {
      lines.push('');
      lines.push('Recent past cycles:');
      history.forEach(h => lines.push(`- ${h.pay_date}: paycheck ${usd(h.paycheck_amount)}, spent ${usd(h.total_spent)}, ended with ${usd(h.safe_to_spend)} safe to spend`));
    }
    billsAccounts.forEach(acct => {
      lines.push('');
      lines.push(`${acct.name}${acct.mask ? ` (…${acct.mask})` : ''} — current balance ${usd(acct.balance)}:`);
      acct.activity.slice(0, 15).forEach(t => {
        lines.push(`- ${t.date}: ${t.name} ${t.amount >= 0 ? '+' : ''}${usd(t.amount)}${t.isIncomingTransfer ? ' (transfer in)' : ''}`);
      });
    });
    lines.push('');
    lines.push('I want financial guidance based on this — ');
    return lines.join('\n');
  };

  const copySummary = () => {
    navigator.clipboard.writeText(buildSummary()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div className="container">
      <div className="topbar">
        <div className="brand"><span className="brand-dot" />Insights</div>
        <Link to="/dashboard" className="btn btn-ghost btn-sm">Back</Link>
      </div>

      <div className="card">
        <button className="btn btn-block" onClick={copySummary}>
          {copied ? 'Copied — paste into a chat with Claude' : 'Copy summary for AI'}
        </button>
      </div>

      <div className="card">
        <h3 className="section-title">This cycle's pace</h3>
        <div className="row"><span>Day {daysElapsed} of {daysTotal}</span><span className="row-amount">{daysLeft} days left</span></div>
        <div className="row"><span>Spending rate</span><span className="row-amount">{usd(spendRate)}/day</span></div>
        <div className="row"><span>Budget pace</span><span className="row-amount">{usd(budgetPaceRate)}/day</span></div>
        <div className="row"><span className={`chip ${paceTone === 'good' ? 'ok' : paceTone === 'bad' ? 'bad' : 'neutral'}`}>{paceLabel}</span></div>
      </div>

      <div className="stats">
        <div className="stat"><div className="stat-label">Projected spend by payday</div><div className="stat-value">{usd(projectedSpend)}</div></div>
        <div className="stat"><div className="stat-label">Projected safe-to-spend</div><div className="stat-value" style={{color: projectedSafe < 0 ? 'var(--red)' : 'inherit'}}>{usd(projectedSafe)}</div></div>
      </div>

      {topExpenses.length > 0 && (
        <div className="card">
          <h3 className="section-title">Biggest expenses this cycle</h3>
          {topExpenses.map((t, i) => (
            <div className="row" key={i}>
              <span>{t.name}<div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{t.date}</div></span>
              <span className="row-amount">{usd(t.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {cardsDueSoon.length > 0 && (
        <div className="card">
          <h3 className="section-title">Card minimums due before payday</h3>
          {cardsDueSoon.map((c, i) => (
            <div className="row" key={i}>
              <span>{c.name}<div className="muted" style={{ fontSize: 12, marginTop: 2 }}>due {c.next.toISOString().slice(0, 10)}</div></span>
              <span className="row-amount">{usd(c.minimum)}</span>
            </div>
          ))}
          <div className="row" style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 10 }}>
            <span className="muted">Total needed</span>
            <span className="row-amount">{usd(dueSoonTotal)}</span>
          </div>
          {unknownDueDate.length > 0 && (
            <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
              {unknownDueDate.map(c => c.name).join(', ')} {unknownDueDate.length === 1 ? 'has' : 'have'} no due date on file — <Link to="/cards" className="quiet">add it</Link>.
            </p>
          )}
        </div>
      )}

      {verify?.details?.length > 0 && (
        <div className="card">
          <h3 className="section-title">Bills status</h3>
          {verify.details.map((d, i) => (
            <div className="row" key={i}>
              <span style={{ fontSize: 14 }}>{d.category}</span>
              <span className={`chip ${d.status === 'Transferred' ? 'ok' : d.status === 'MISSING' ? 'bad' : 'neutral'}`}>{d.status}</span>
            </div>
          ))}
        </div>
      )}

      {billsAccounts.map((acct, ai) => (
        <div className="card" key={ai}>
          <h3 className="section-title">{acct.name}{acct.mask ? ` · …${acct.mask}` : ''}</h3>
          <div className="row"><span className="muted">Current balance</span><span className="row-amount">{usd(acct.balance)}</span></div>
          {acct.activity.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No activity in the last 2 months.</p>}
          {acct.activity.map((t, i) => (
            <div className="row" key={i}>
              <span>{t.name}{t.isIncomingTransfer && <span className="chip neutral" style={{ marginLeft: 8 }}>transfer in</span>}
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{t.date}</div>
              </span>
              <span className="row-amount" style={{ color: t.amount >= 0 ? 'var(--green)' : 'var(--text)' }}>
                {t.amount >= 0 ? '+' : ''}{usd(t.amount)}
              </span>
            </div>
          ))}
        </div>
      ))}

      {history.length > 0 && (
        <div className="card">
          <h3 className="section-title">Recent cycles</h3>
          {history.map((h, i) => (
            <div className="row" key={i}>
              <span>{h.pay_date}<div className="muted" style={{ fontSize: 12, marginTop: 2 }}>paycheck {usd(h.paycheck_amount)}, spent {usd(h.total_spent)}</div></span>
              <span className="row-amount">{usd(h.safe_to_spend)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="link-row">
        <Link to="/cards" className="quiet">Credit cards</Link>
        {' · '}
        <Link to="/dashboard" className="quiet">Back to dashboard</Link>
      </div>
    </div>
  );
}
