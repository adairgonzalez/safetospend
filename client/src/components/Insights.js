import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WarningIcon, SparkleIcon, ClockIcon, WalletIcon } from './Icons';

const usd = (n) => (typeof n === 'number' ? n : 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const dayMs = 86400000;

// Date objects representing a civil calendar date (today) must format using
// local fields - .toISOString() converts to UTC first, which silently shows
// tomorrow's date once evening rolls past UTC midnight in any timezone
// behind UTC (all of North America). Card due dates come pre-formatted as
// dateStr from the server (server/cardStatus.js) for the same reason.
const localISODate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const cardStatusLabel = (c) => {
  if (c.status === 'overdue') return `${c.daysOverdue} day${c.daysOverdue === 1 ? '' : 's'} overdue`;
  if (c.status === 'due_today') return 'due today';
  if (c.status === 'upcoming') return `due ${c.dateStr}`;
  return 'due date unknown';
};

export default function Insights({ token }) {
  const [data, setData] = useState(null);
  const [verify, setVerify] = useState(null);
  const [history, setHistory] = useState([]);
  const [billsAccounts, setBillsAccounts] = useState([]);
  const [cards, setCards] = useState([]);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState('overview');
  const navigate = useNavigate();

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

  const topbar = (
    <div className="topbar">
      <div className="brand"><span className="brand-dot" />Insights</div>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard')}>Back</button>
    </div>
  );

  if (error) return <div className="page">{topbar}<div className="card empty"><p>{error}</p></div></div>;
  if (!data) return (
    <div className="page">
      {topbar}
      <div className="skel skel-hero" />
      <div className="skel skel-row" /><div className="skel skel-row" /><div className="skel skel-row" />
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

  // Overdue and due-today cards are always urgent regardless of date;
  // upcoming cards only count if their due date falls before payday.
  // dateStr is 'YYYY-MM-DD', which sorts/compares correctly as a plain
  // string - no Date parsing needed (and no timezone risk) for this check.
  const cardsDueSoon = cards
    .filter(c => c.status === 'overdue' || c.status === 'due_today' || (c.status === 'upcoming' && c.dateStr && c.dateStr <= data.nextPayday))
    .sort((a, b) => (a.dateStr || '').localeCompare(b.dateStr || ''));
  const overdueCards = cardsDueSoon.filter(c => c.status === 'overdue');
  const dueSoonTotal = cardsDueSoon.reduce((s, c) => s + c.minimum, 0);
  const unknownDueDate = cards.filter(c => !c.due_day);

  const billsBalance = billsAccounts[0]?.balance ?? null;
  const availableBuffer = billsBalance != null ? billsBalance - dueSoonTotal : null;

  const buildSummary = () => {
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
    if (overdueCards.length) {
      lines.push('');
      lines.push('OVERDUE cards:');
      overdueCards.forEach(c => lines.push(`- ${c.name}: ${usd(c.minimum)}, ${c.daysOverdue} day(s) overdue`));
    }
    if (cardsDueSoon.length) {
      lines.push('');
      lines.push(`Card minimums due before next payday (${data.nextPayday}) — total ${usd(dueSoonTotal)}:`);
      cardsDueSoon.forEach(c => lines.push(`- ${c.name}: ${usd(c.minimum)}, ${cardStatusLabel(c)}`));
    }
    if (billsBalance != null) {
      lines.push('');
      lines.push(`Bills and Debt balance: ${usd(billsBalance)} — reserved for cards above: ${usd(dueSoonTotal)} — available buffer: ${usd(availableBuffer)}`);
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

  const dayProgress = Math.min(100, Math.round((daysElapsed / daysTotal) * 100));

  return (
    <div className="page">
      {topbar}

      {overdueCards.length > 0 && (
        <div className="banner danger">
          <span className="banner-icon"><WarningIcon width={19} height={19} color="var(--red)" /></span>
          <div>
            <p className="banner-title" style={{ color: 'var(--red)' }}>{overdueCards.length} card{overdueCards.length === 1 ? '' : 's'} overdue</p>
            <p className="banner-body">{overdueCards.map(c => `${c.name} (${usd(c.minimum)})`).join(', ')}</p>
          </div>
        </div>
      )}

      <button className="btn btn-block" onClick={copySummary} style={{ marginBottom: 12 }}>
        <SparkleIcon width={17} height={17} />{copied ? 'Copied — paste into a chat with Claude' : 'Copy summary for AI'}
      </button>

      <div className="tabs">
        <button className={`tab${tab === 'overview' ? ' active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
        <button className={`tab${tab === 'bills' ? ' active' : ''}`} onClick={() => setTab('bills')}>Bills & cards</button>
        <button className={`tab${tab === 'history' ? ' active' : ''}`} onClick={() => setTab('history')}>History</button>
      </div>

      {tab === 'overview' && (
        <>
          {data.carryoverDeficit < 0 && (
            <div className="card">
              <div className="row">
                <span className="muted">Carried over from last cycle</span>
                <span className="row-amount" style={{ color: 'var(--red)' }}>{usd(data.carryoverDeficit)}</span>
              </div>
            </div>
          )}

          <div className="card">
            <h3 className="section-title"><ClockIcon width={14} height={14} />This cycle's pace</h3>
            <div className="row"><span>Day {daysElapsed} of {daysTotal}</span><span className="row-amount">{daysLeft} days left</span></div>
            <div className="hero-progress" style={{ marginTop: 2, marginBottom: 10 }}>
              <div className="hero-progress-fill" style={{ width: `${dayProgress}%`, background: paceTone === 'bad' ? 'linear-gradient(90deg,#fb7185,#e11d48)' : paceTone === 'warn' ? 'linear-gradient(90deg,#fbbf24,#d97706)' : undefined }} />
            </div>
            <div className="row"><span>Spending rate</span><span className="row-amount">{usd(spendRate)}/day</span></div>
            <div className="row"><span>Budget pace</span><span className="row-amount">{usd(budgetPaceRate)}/day</span></div>
            <div className="row"><span className={`chip ${paceTone === 'good' ? 'ok' : paceTone === 'bad' ? 'bad' : 'warn'}`}><span className="chip-dot" />{paceLabel}</span></div>
          </div>

          <div className="stats">
            <div className="stat"><div className="stat-label">Projected spend by payday</div><div className="stat-value">{usd(projectedSpend)}</div></div>
            <div className="stat"><div className="stat-label">Projected safe-to-spend</div><div className="stat-value" style={{color: projectedSafe < 0 ? 'var(--red)' : 'inherit'}}>{usd(projectedSafe)}</div></div>
          </div>
        </>
      )}

      {tab === 'bills' && (
        <>
          {billsBalance != null && (
            <div className="card">
              <h3 className="section-title"><WalletIcon width={14} height={14} />Bills and Debt — available buffer</h3>
              <div className="row"><span className="muted">Current balance</span><span className="row-amount">{usd(billsBalance)}</span></div>
              <div className="row"><span className="muted">Reserved for cards due soon</span><span className="row-amount">{usd(dueSoonTotal)}</span></div>
              <div className="row" style={{ marginTop: 4 }}>
                <span style={{ fontWeight: 700 }}>Genuinely available</span>
                <span className="row-amount" style={{ color: availableBuffer < 0 ? 'var(--red)' : 'var(--green)', fontSize: 17 }}>{usd(availableBuffer)}</span>
              </div>
              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                This is what's left after covering every card due before your next paycheck — not what's sitting in the account.
              </p>
            </div>
          )}

          {cardsDueSoon.length > 0 && (
            <div className="card">
              <h3 className="section-title">Card minimums due before payday</h3>
              {cardsDueSoon.map((c, i) => (
                <div className={`row row-accent ${c.status === 'overdue' ? 'bad' : c.status === 'due_today' ? 'warn' : ''}`} key={i}>
                  <div className="row-main">
                    <div className="row-title">{c.name}</div>
                    <div className="row-meta" style={{ color: c.status === 'overdue' ? 'var(--red)' : undefined, fontWeight: c.status === 'overdue' ? 700 : 400 }}>{cardStatusLabel(c)}</div>
                  </div>
                  <span className="row-amount">{usd(c.minimum)}</span>
                </div>
              ))}
              <div className="row" style={{ marginTop: 4 }}>
                <span className="muted">Total needed</span>
                <span className="row-amount">{usd(dueSoonTotal)}</span>
              </div>
              {unknownDueDate.length > 0 && (
                <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                  {unknownDueDate.map(c => c.name).join(', ')} {unknownDueDate.length === 1 ? 'has' : 'have'} no due date on file — <span className="quiet" style={{cursor:'pointer'}} onClick={() => navigate('/cards')}>add it</span>.
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
                  <div className="row-main">
                    <div className="row-title">{t.name}{t.isIncomingTransfer && <span className="chip neutral">transfer in</span>}</div>
                    <div className="row-meta">{t.date}</div>
                  </div>
                  <span className="row-amount" style={{ color: t.amount >= 0 ? 'var(--green)' : 'var(--text)' }}>
                    {t.amount >= 0 ? '+' : ''}{usd(t.amount)}
                  </span>
                </div>
              ))}
            </div>
          ))}

          <div className="link-row">
            <span className="quiet" style={{cursor:'pointer'}} onClick={() => navigate('/cards')}>Credit cards</span>
          </div>
        </>
      )}

      {tab === 'history' && (
        <>
          {topExpenses.length > 0 && (
            <div className="card">
              <h3 className="section-title">Biggest expenses this cycle</h3>
              {topExpenses.map((t, i) => (
                <div className="row" key={i}>
                  <div className="row-main"><div className="row-title">{t.name}</div><div className="row-meta">{t.date}</div></div>
                  <span className="row-amount">{usd(t.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {history.length > 0 && (
            <div className="card">
              <h3 className="section-title">Recent cycles</h3>
              {history.map((h, i) => (
                <div className="row" key={i}>
                  <div className="row-main"><div className="row-title">{h.pay_date}</div><div className="row-meta">paycheck {usd(h.paycheck_amount)}, spent {usd(h.total_spent)}</div></div>
                  <span className="row-amount">{usd(h.safe_to_spend)}</span>
                </div>
              ))}
            </div>
          )}

          {topExpenses.length === 0 && history.length === 0 && (
            <p className="muted center" style={{ fontSize: 13, marginTop: 20 }}>Nothing to show yet.</p>
          )}
        </>
      )}
    </div>
  );
}
