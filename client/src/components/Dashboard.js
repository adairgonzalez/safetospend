import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PlaidLink from './PlaidLink';
import VerificationPanel from './VerificationPanel';

const usd = (n) => (typeof n === 'number' ? n : 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function Dashboard({ token, onLogout }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/transactions/safe-to-spend', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(e => { setData({ error: `Could not reach server: ${e.message}` }); setLoading(false); });
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const shell = (children) => (
    <div className="container">
      <div className="topbar">
        <div className="brand"><span className="brand-dot" />Safe to Spend</div>
        <button onClick={onLogout} className="btn btn-ghost btn-sm">Log out</button>
      </div>
      {children}
    </div>
  );

  if (loading) return shell(<div className="empty"><p className="muted">Loading your money…</p></div>);

  if (data?.error) return shell(
    <div className="card empty">
      <h2>{data.noBank ? 'Connect your bank' : 'Nothing to show yet'}</h2>
      <p>{data.noBank ? 'Link your Capital One account to start tracking.' : data.error}</p>
      {data.noBank ? <PlaidLink token={token} /> : <button className="btn" onClick={load}>Refresh</button>}
    </div>
  );

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

      <VerificationPanel token={token} />

      <div className="link-row">
        <Link to="/template" className="quiet">Edit bill template</Link>
      </div>
    </>
  );
}
