import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshIcon, PlugIcon } from './Icons';

const usd = (n) => Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function TransactionsDebug({ token }) {
  const [txns, setTxns] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState(null);
  const navigate = useNavigate();

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
    <div className="page">
      <div className="topbar">
        <div className="brand"><span className="brand-dot" />Raw transactions</div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/more')}>Back</button>
      </div>

      <div className="card">
        <button className="btn btn-block" onClick={forceRefresh} disabled={refreshing}>
          <RefreshIcon width={16} height={16} />{refreshing ? 'Refreshing…' : 'Refresh from bank'}
        </button>
        {refreshMsg && <p className="muted center" style={{marginTop:10, marginBottom:0, fontSize:13}}>{refreshMsg}</p>}
        <button className="btn btn-ghost btn-block" style={{marginTop:10}} onClick={registerWebhook}>
          <PlugIcon width={16} height={16} />Register webhook with Plaid
        </button>
        {webhookMsg && <p className={webhookMsg.startsWith('Failed') ? 'error-text center' : 'muted center'} style={{marginTop:10, marginBottom:0, fontSize:13}}>{webhookMsg}</p>}
        {error && <p className="error-text">{error}</p>}
      </div>

      {!error && !txns && <p className="muted center">Loading…</p>}
      {txns && txns.length === 0 && <p className="muted center">No transactions returned.</p>}
      {txns && txns.length > 0 && (
        <div className="card">
          {txns.map((t, i) => {
            const isDeposit = t.amount < 0;
            return (
              <div className="row" key={i}>
                <div className="row-main">
                  <div className="row-title">{t.name}{t.pending && <span className="chip neutral">pending</span>}</div>
                  <div className="row-meta">{t.date} · {t.account_id.slice(0, 10)}…</div>
                </div>
                <span className="row-amount" style={{ color: isDeposit ? 'var(--green)' : 'var(--text)' }}>
                  {isDeposit ? '+' : ''}{usd(-t.amount)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
