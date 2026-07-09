import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const usd = (n) => Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function TransactionsDebug({ token }) {
  const [txns, setTxns] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/transactions/debug', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setTxns(d); })
      .catch(e => setError(e.message));
  }, [token]);

  return (
    <div className="container">
      <div className="topbar">
        <div className="brand"><span className="brand-dot" />Raw transactions</div>
        <Link to="/dashboard" className="btn btn-ghost btn-sm">Back</Link>
      </div>
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
