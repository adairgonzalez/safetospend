import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PlaidLink from './PlaidLink';
import VerificationPanel from './VerificationPanel';
import AnimatedNumber from './AnimatedNumber';
import { RefreshIcon, ArrowUpIcon, WarningIcon } from './Icons';

const usd = (n) => (typeof n === 'number' ? n : 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function Dashboard({ token, onLogout }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState(null);
  const navigate = useNavigate();

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

      <VerificationPanel token={token} checklist={data.checklist} />

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
