import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const usd = (n) => Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function TransactionsDebug({ token }) {
  const [txns, setTxns] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState(null);

  const load = () => {
    fetch('/api/transactions/debug', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else { setTxns(d); setError(null); } })
      .catch(e => setError(e.message));
  };

  useEffect(load, [token]);

  const forceRefresh = () => {
    setRefreshing(true);
    setRefreshMsg(null);
    fetch('/api/transactions/force-refresh', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setRefreshing(false); return; }
        setRefreshMsg('Asked your bank for the latest activity — reloading in 20s…');
        setTimeout(() => { load(); setRefreshing(false); setRefreshMsg(null); }, 20000);
      })
      .catch(e => { setError(e.message); setRefreshing(false); });
  };

  const [webhookMsg, setWebhookMsg] = useState(null);
  const registerWebhook = () => {
    setWebhookMsg('Registering…');
    fetch('/api/plaid/set-webhook', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setWebhookMsg(d.success ? `Webhook registered: ${d.webhook}` : `Failed: ${d.error}`))
      .catch(e => setWebhookMsg(`Failed: ${e.message}`));
  };

  return (
    <div className="container">
      <div className="topbar">
        <div className="brand"><span className="brand-dot" />Raw transactions</div>
        <Link to="/dashboard" className="btn btn-ghost btn-sm">Back</Link>
      </div>
      <button className="btn btn-block" style={{marginBottom:16}} onClick={forceRefresh} disabled={refreshing}>
        {refreshing ? 'Refreshing…' : 'Refresh from bank'}
      </button>
      {refreshMsg && <p className="muted center" style={{marginTop:-8}}>{refreshMsg}</p>}
      <button className="btn btn-ghost btn-block" style={{marginBottom:16}} onClick={registerWebhook}>
        Register webhook with Plaid
      </button>
      {webhookMsg && <p className={webhookMsg.startsWith('Failed') ? 'error-text center' : 'muted center'} style={{marginTop:-8, marginBottom:16}}>{webhookMsg}</p>}
      {error && <p className="error-text">{error}</p>}
      {!error && !txns && <p className="muted">Loading…</p>}
      {txns && txns.length === 0 && <p className="muted">No transactions returned.</p>}
      {txns && txns.map((t, i) => {
        const isDeposit = t.amount < 0;
        return (
          <div className="card" key={i} style={{padding:14, marginBottom:8}}>
            <div className="row" style={{padding:0, border:'none'}}>
              <span style={{fontSize:14}}>{t.name}{t.pending && <span className="chip neutral" style={{marginLeft:8}}>pending</span>}</span>
              <span className="row-amount" style={{color: isDeposit ? 'var(--green)' : 'var(--text)'}}>
                {isDeposit ? '+' : ''}{usd(-t.amount)}
              </span>
            </div>
            <div className="muted" style={{fontSize:12, marginTop:4}}>{t.date} · {t.account_id}</div>
          </div>
        );
      })}
    </div>
  );
}
