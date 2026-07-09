import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PlaidLink from './PlaidLink';
import VerificationPanel from './VerificationPanel';

const usd = (n) => (typeof n === 'number' ? n : 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function Dashboard({ token, onLogout }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState(null);
  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/transactions/safe-to-spend', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(e => { setData({ error: `Could not reach server: ${e.message}` }); setLoading(false); });
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
    <div className="container">
      <div className="topbar">
        <div className="brand"><span className="brand-dot" />Safe to Spend</div>
        <div style={{display:'flex', gap:8}}>
          {showRefresh && (
            <button onClick={forceRefresh} disabled={refreshing} className="btn btn-ghost btn-sm">
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          )}
          <button onClick={onLogout} className="btn btn-ghost btn-sm">Log out</button>
        </div>
      </div>
      {refreshMsg && (
        <p className={refreshMsg.startsWith('Refresh failed') || refreshMsg.startsWith('Could not reach') ? 'error-text center' : 'muted center'}
           style={{marginTop:-16, marginBottom:16, fontSize:13}}>
          {refreshMsg}
        </p>
      )}
      {children}
    </div>
  );

  if (loading) return shell(<div className="empty"><p className="muted">Loading your money…</p></div>);

  if (data?.error) return shell(
    <div className="card empty">
      <h2>{data.noBank ? 'Connect your bank' : 'Nothing to show yet'}</h2>
      <p>{data.noBank ? 'Link your Capital One account to start tracking.' : data.error}</p>
      {data.noBank
        ? <PlaidLink token={token} />
        : (
          <>
            <button className="btn" onClick={forceRefresh} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh from bank'}</button>
            <div className="link-row" style={{marginTop:14}}><Link to="/debug" className="quiet">View raw transactions</Link></div>
          </>
        )}
    </div>
  , !data.noBank);

  const tone = data.safeToSpend < 0 ? 'bad' : data.safeToSpend < 50 ? 'warn' : 'good';
  const daysLeft = Math.max(0, Math.ceil((new Date(data.nextPayday) - new Date()) / 86400000));

  return shell(
    <>
      <div className="card hero">
        <div className="hero-label">Safe to spend</div>
        <div className={`hero-amount ${tone}`}>{usd(data.safeToSpend)}</div>
        <div className="hero-sub">until {data.nextPayday} · {daysLeft} day{daysLeft === 1 ? '' : 's'} left</div>
      </div>

      <div className="stats">
        <div className="stat"><div className="stat-label">Paycheck ({data.paycheckDate})</div><div className="stat-value">{usd(data.paycheckAmount)}</div></div>
        <div className="stat"><div className="stat-label">Set aside for bills</div><div className="stat-value">{usd(data.paycheckAmount - data.discretionaryBudget)}</div></div>
        <div className="stat"><div className="stat-label">Spent so far</div><div className="stat-value">{usd(data.totalSpent)}</div></div>
      </div>

      <div className="card">
        <h3 className="section-title">Transfer checklist</h3>
        {data.checklist?.map((c, i) => (
          <div className="row" key={i}>
            <span>{c.category}</span>
            <span className="row-amount">{usd(c.amount)}</span>
          </div>
        ))}
      </div>

      {data.spending?.length > 0 && (
        <div className="card">
          <h3 className="section-title">Spending since payday</h3>
          {data.spending.map((t, i) => (
            <div className="row" key={i} style={{alignItems:'flex-start'}}>
              <span>{t.name}{t.pending && <span className="chip neutral" style={{marginLeft:8}}>pending</span>}
                <div className="muted" style={{fontSize:12, marginTop:2}}>{t.date}</div>
                <button className="quiet" style={{fontSize:12, marginTop:4}} onClick={() => flagReimbursable(t)}>
                  Mark reimbursable
                </button>
              </span>
              <span className="row-amount">{usd(t.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {data.reimbursements?.length > 0 && (
        <div className="card">
          <h3 className="section-title">Reimbursements</h3>
          {data.reimbursements.map((r, i) => (
            <div className="row" key={i} style={{alignItems:'flex-start'}}>
              <span>{r.name}
                <div className="muted" style={{fontSize:12, marginTop:2}}>{r.date}</div>
                <div style={{marginTop:4, display:'flex', gap:12}}>
                  {!r.received && <button className="quiet" style={{fontSize:12}} onClick={() => markReimbursed(r.transaction_id)}>Mark received</button>}
                  <button className="quiet" style={{fontSize:12}} onClick={() => unflagReimbursable(r.transaction_id)}>Unflag</button>
                </div>
              </span>
              <span style={{display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6}}>
                <span className="row-amount">{usd(r.amount)}</span>
                <span className={`chip ${r.received ? 'ok' : 'neutral'}`}>{r.received ? 'received' : 'pending'}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      <VerificationPanel token={token} />

      <div className="link-row">
        <Link to="/template" className="quiet">Edit bill template</Link>
        {' · '}
        <Link to="/debug" className="quiet">Raw transactions</Link>
      </div>
    </>
  , true);
}
