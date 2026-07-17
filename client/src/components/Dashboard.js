import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PlaidLink from './PlaidLink';
import VerificationPanel from './VerificationPanel';
import AnimatedNumber from './AnimatedNumber';
import { RefreshIcon, ArrowUpIcon, WarningIcon, CalendarIcon, TrendDownIcon } from './Icons';
import { computeDebtPlan } from '../utils/debtPlan';

const usd = (n) => (typeof n === 'number' ? n : 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const cardStatusLabel = (c) => {
  if (c.status === 'overdue') return `${c.daysOverdue} day${c.daysOverdue === 1 ? '' : 's'} overdue`;
  if (c.status === 'due_today') return 'due today';
  if (c.status === 'upcoming') return `due ${c.dateStr}`;
  return 'due date unknown';
};

export default function Dashboard({ token, onLogout }) {
  const [data, setData] = useState(null);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState(null);
  const navigate = useNavigate();

  const load = useCallback(() => {
    setLoading(true);
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch('/api/transactions/safe-to-spend', { headers }).then(r => r.json()),
      fetch('/api/cards', { headers }).then(r => r.json()).catch(() => []),
    ]).then(([d, c]) => {
      setData(d);
      setCards(Array.isArray(c) ? c : []);
      setLoading(false);
    }).catch(e => { setData({ error: `Could not reach server: ${e.message}` }); setLoading(false); });
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const callAndReload = (path, body) => {
    fetch(path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(r => r.json())
      .then(d => { if (!d.error) load(); })
      .catch(() => {});
  };
  const flagReimbursable = (t) => callAndReload('/api/transactions/flag-reimbursable', {
    transaction_id: t.transaction_id, name: t.name, amount: t.amount, date: t.date,
  });
  const unflagReimbursable = (transaction_id) => callAndReload('/api/transactions/unflag-reimbursable', { transaction_id });
  const markReimbursed = (transaction_id) => callAndReload('/api/transactions/mark-reimbursed', { transaction_id });

  const forceRefresh = () => {
    setRefreshing(true);
    setRefreshMsg(null);
    fetch('/api/transactions/force-refresh', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (d.error) {
          setRefreshMsg(`Refresh failed: ${d.error}${d.error_code ? ` (${d.error_code})` : ''}`);
          setRefreshing(false);
          return;
        }
        setRefreshMsg('Asked your bank for the latest activity — reloading in 20s…');
        setTimeout(() => { load(); setRefreshing(false); setRefreshMsg(null); }, 20000);
      })
      .catch(e => { setRefreshMsg(`Could not reach server: ${e.message}`); setRefreshing(false); });
  };

  const shell = (children, showRefresh) => (
    <div className="page">
      <div className="topbar">
        <div className="brand"><span className="brand-dot" />Safe to Spend</div>
        <div className="topbar-actions">
          {showRefresh && (
            <button onClick={forceRefresh} disabled={refreshing} className="btn btn-ghost btn-icon" aria-label="Refresh">
              <RefreshIcon width={18} height={18} style={refreshing ? { animation: 'spin 1s linear infinite' } : undefined} />
            </button>
          )}
          <button onClick={onLogout} className="btn btn-ghost btn-sm">Log out</button>
        </div>
      </div>
      {refreshMsg && (
        <p className={refreshMsg.startsWith('Refresh failed') || refreshMsg.startsWith('Could not reach') ? 'error-text center' : 'muted center'}
           style={{marginTop:-10, marginBottom:16, fontSize:13}}>
          {refreshMsg}
        </p>
      )}
      {children}
    </div>
  );

  if (loading) return shell(
    <>
      <div className="skel skel-hero" />
      <div className="skel skel-row" /><div className="skel skel-row" /><div className="skel skel-row" />
    </>
  );

  if (data?.error) return shell(
    <div className="card empty">
      <div className="empty-icon">{data.noBank ? '🏦' : '🔍'}</div>
      <h2>{data.noBank ? 'Connect your bank' : 'Nothing to show yet'}</h2>
      <p>{data.noBank ? 'Link your Capital One account to start tracking.' : data.error}</p>
      {data.noBank
        ? <PlaidLink token={token} />
        : (
          <>
            <button className="btn" onClick={forceRefresh} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh from bank'}</button>
            <div className="link-row" style={{marginTop:14}}><span className="quiet" style={{cursor:'pointer'}} onClick={() => navigate('/debug')}>View raw transactions</span></div>
          </>
        )}
    </div>
  , !data.noBank);

  const tone = data.safeToSpend < 0 ? 'bad' : data.safeToSpend < 50 ? 'warn' : 'good';
  const daysLeft = Math.max(0, Math.ceil((new Date(data.nextPayday) - new Date()) / 86400000));
  const cyclePct = Math.max(0, Math.min(100, 100 - (daysLeft / 14) * 100));

  // Upcoming bills = every bill in this cycle's checklist (rent, Tesla,
  // insurance, card minimums, etc.) plus credit card due dates landing
  // before the next paycheck (overdue/due-today always included regardless
  // of date). Checklist bills don't carry an exact calendar due date - they
  // get transferred right after payday - so they're tagged with the
  // paycheck date and naturally sort to the front of the list.
  const billItems = (data.checklist || []).map((c, i) => ({
    key: `bill-${i}`, name: c.category, amount: c.amount, dateStr: data.paycheckDate,
    label: c.autopay ? 'auto-pay' : 'this cycle', autopay: c.autopay, tone: '',
  }));
  const cardItems = cards
    .filter(c => c.status === 'overdue' || c.status === 'due_today' || (c.status === 'upcoming' && c.dateStr && c.dateStr <= data.nextPayday))
    .map((c, i) => ({
      key: `card-${i}`, name: c.name, amount: c.minimum, dateStr: c.dateStr,
      label: cardStatusLabel(c), autopay: false, tone: c.status === 'overdue' ? 'bad' : c.status === 'due_today' ? 'warn' : '',
    }));
  const upcomingBills = [...billItems, ...cardItems].sort((a, b) => (a.dateStr || '').localeCompare(b.dateStr || ''));

  const debtPlan = computeDebtPlan(cards, data.safeToSpend);

  return shell(
    <>
      <div className={`card hero${tone === 'good' ? ' accent-good' : tone === 'bad' ? ' accent-bad' : ' accent-warn'}`}>
        <div className="hero-label">Safe to spend</div>
        <AnimatedNumber value={data.safeToSpend} className={`hero-amount ${tone}`} />
        <div className="hero-sub">until {data.nextPayday} · {daysLeft} day{daysLeft === 1 ? '' : 's'} left</div>
        <div className="hero-progress"><div className="hero-progress-fill" style={{ width: `${cyclePct}%` }} /></div>
      </div>

      <div className="stats">
        <div className="stat"><div className="stat-label">Paycheck ({data.paycheckDate})</div><div className="stat-value">{usd(data.paycheckAmount)}</div></div>
        <div className="stat"><div className="stat-label">Set aside for bills</div><div className="stat-value">{usd(data.billsAllocated)}</div></div>
        <div className="stat"><div className="stat-label">Spent so far</div><div className="stat-value">{usd(data.totalSpent)}</div></div>
      </div>

      {data.carryoverDeficit < 0 && (
        <div className="banner danger">
          <span className="banner-icon"><WarningIcon width={18} height={18} color="var(--red)" /></span>
          <div>
            <p className="banner-title" style={{color:'var(--red)'}}>Carried over from last cycle</p>
            <p className="banner-body">{usd(data.carryoverDeficit)} shortfall rolled into this cycle's budget.</p>
          </div>
        </div>
      )}

      {upcomingBills.length > 0 && (
        <div className="card">
          <h3 className="section-title"><CalendarIcon width={14} height={14} />Upcoming bills</h3>
          {upcomingBills.map((item) => (
            <div className={`row row-accent ${item.tone}`} key={item.key}>
              <div className="row-main">
                <div className="row-title">{item.name}{item.autopay && <span className="chip neutral">auto-pay</span>}</div>
                <div className="row-meta" style={{ color: item.tone === 'bad' ? 'var(--red)' : undefined, fontWeight: item.tone === 'bad' ? 700 : 400 }}>{item.label}</div>
              </div>
              <span className="row-amount">{usd(item.amount)}</span>
            </div>
          ))}
          <div className="link-row" style={{ marginTop: 4 }}>
            <span className="quiet" style={{ cursor: 'pointer' }} onClick={() => navigate('/cards')}>See all cards →</span>
          </div>
        </div>
      )}

      <VerificationPanel token={token} checklist={data.checklist} />

      {debtPlan.debts.length > 0 && (
        <div className="card">
          <h3 className="section-title"><TrendDownIcon width={14} height={14} />Best use of leftover money for debt</h3>
          {debtPlan.pool <= 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>Nothing safe to spend right now, so there's no extra to put toward debt this cycle.</p>
          ) : (
            <>
              <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
                Putting your {usd(debtPlan.pool)} safe-to-spend toward the highest-interest balances first minimizes what you pay in interest overall.
              </p>
              {debtPlan.allocations.map((a, i) => (
                <div className="row row-accent good" key={i}>
                  <div className="row-main">
                    <div className="row-title">{a.name}{a.payoff && <span className="chip ok">pays it off</span>}</div>
                    <div className="row-meta">{a.apr != null ? `${a.apr}% APR` : 'APR unknown'}</div>
                  </div>
                  <span className="row-amount">{usd(a.amount)}</span>
                </div>
              ))}
              {debtPlan.unallocated > 0.01 && (
                <div className="row"><span className="muted">Left over after clearing all balances</span><span className="row-amount">{usd(debtPlan.unallocated)}</span></div>
              )}
              {debtPlan.missingApr && (
                <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                  Some cards are missing an interest rate — <span className="quiet" style={{cursor:'pointer'}} onClick={() => navigate('/cards')}>add it</span> for a more accurate order.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {data.spending?.length > 0 && (
        <div className="card">
          <h3 className="section-title"><ArrowUpIcon width={14} height={14} />Spending since payday</h3>
          {data.spending.map((t, i) => (
            <div className="row" key={i}>
              <div className="row-main">
                <div className="row-title">{t.name}{t.pending && <span className="chip neutral">pending</span>}</div>
                <div className="row-meta">{t.date}</div>
                <div className="row-actions">
                  <button className="quiet" onClick={() => flagReimbursable(t)}>Mark reimbursable</button>
                </div>
              </div>
              <span className="row-amount">{usd(t.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {data.reimbursements?.length > 0 && (
        <div className="card">
          <h3 className="section-title">Reimbursements</h3>
          {data.reimbursements.map((r, i) => (
            <div className="row" key={i}>
              <div className="row-main">
                <div className="row-title">{r.name}</div>
                <div className="row-meta">{r.date}</div>
                <div className="row-actions">
                  {!r.received && <button className="quiet" onClick={() => markReimbursed(r.transaction_id)}>Mark received</button>}
                  <button className="quiet" onClick={() => unflagReimbursable(r.transaction_id)}>Unflag</button>
                </div>
              </div>
              <div className="row-side">
                <span className="row-amount">{usd(r.amount)}</span>
                <span className={`chip ${r.received ? 'ok' : 'neutral'}`}>{r.received ? 'received' : 'pending'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  , true);
}
