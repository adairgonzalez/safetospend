import React, { useState } from 'react';

const usd = (n) => (typeof n === 'number' ? n : 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function VerificationPanel({ token }) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const verify = () => {
    setBusy(true);
    fetch('/api/verify/verify-transfers', { method:'POST', headers:{Authorization:`Bearer ${token}`} })
      .then(r => r.json()).then(d => { setResult(d); setBusy(false); })
      .catch(() => setBusy(false));
  };

  const chip = (d) => {
    if (d.status === 'Transferred') return <span className="chip ok">Transferred</span>;
    if (d.status === 'MISSING') return <span className="chip bad">Missing</span>;
    return <span className="chip neutral">{d.status}</span>;
  };

  return (
    <div className="card">
      <h3 className="section-title">Transfer verification</h3>
      {!result && (
        <button className="btn btn-block" onClick={verify} disabled={busy}>
          {busy ? 'Checking balances…' : 'Verify transfers'}
        </button>
      )}
      {result && result.error && <p className="error-text">{result.error}</p>}
      {result && !result.error && (
        <div>
          <p style={{marginTop:0, fontWeight:600, color: result.allGood ? 'var(--green)' : 'var(--red)'}}>
            {result.allGood ? 'All transfers confirmed' : 'Some transfers are missing'}
          </p>
          {result.details.map((d, i) => (
            <div className="row" key={i}>
              <span style={{fontSize:14}}>{d.category}
                {d.status === 'MISSING' && <div className="muted" style={{fontSize:12, marginTop:2}}>expected {usd(d.expected)} · actual {usd(d.actual)}</div>}
              </span>
              {chip(d)}
            </div>
          ))}
          {!result.allGood && (
            <p style={{marginBottom:0}}>
              <a className="quiet" href="https://myaccounts.capitalone.com/" target="_blank" rel="noreferrer" style={{color:'var(--amber)'}}>
                Open Capital One to fix →
              </a>
            </p>
          )}
          <div style={{marginTop:16}}>
            <button className="btn btn-ghost btn-sm" onClick={verify} disabled={busy}>{busy ? 'Checking…' : 'Re-verify'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
