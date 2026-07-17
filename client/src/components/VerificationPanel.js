import React, { useState } from 'react';
import { WarningIcon, WalletIcon } from './Icons';

const usd = (n) => (typeof n === 'number' ? n : 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

// Merges the bill checklist and its verification status into a single card
// (previously two separate cards) to cut one full card's worth of scroll.
export default function VerificationPanel({ token, checklist }) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const verify = () => {
    setBusy(true);
    fetch('/api/verify/verify-transfers', { method:'POST', headers:{Authorization:`Bearer ${token}`} })
      .then(r => r.json()).then(d => { setResult(d); setBusy(false); })
      .catch(() => setBusy(false));
  };

  const chip = (d) => {
    if (d.status === 'Transferred') return <span className="chip ok"><span className="chip-dot" />Transferred</span>;
    if (d.status === 'MISSING') return <span className="chip bad"><span className="chip-dot" />Missing</span>;
    return <span className="chip neutral">{d.status}</span>;
  };

  return (
    <div className={`card${result && !result.error ? (result.allGood ? ' accent-good' : ' accent-bad') : ''}`}>
      <h3 className="section-title"><WalletIcon width={14} height={14} />Bills this cycle</h3>
      {checklist?.map((c, i) => (
        <div className="row" key={i}>
          <span className="row-title">{c.category}{c.autopay && <span className="chip neutral">auto-pay</span>}</span>
          <span className="row-amount">{usd(c.amount)}</span>
        </div>
      ))}

      {!result && (
        <button className="btn btn-block" onClick={verify} disabled={busy} style={{ marginTop: 12 }}>
          {busy ? 'Checking balances…' : 'Verify transfers'}
        </button>
      )}
      {result && result.error && <p className="error-text">{result.error}</p>}
      {result && !result.error && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-soft)' }}>
          {result.allGood ? (
            <div className="center" style={{ marginBottom: 10 }}>
              <svg className="check-burst" viewBox="0 0 56 56" fill="none" style={{ width: 40, height: 40, marginBottom: 8 }}>
                <circle cx="28" cy="28" r="26" fill="rgba(74,222,128,0.14)" stroke="var(--green)" strokeWidth="2" />
                <path d="M17 29l7 7 15-15" stroke="var(--green)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p style={{ margin: 0, fontWeight: 700, color: 'var(--green)' }}>All transfers confirmed</p>
            </div>
          ) : (
            <div className="banner danger" style={{ padding: '10px 14px', marginBottom: 10 }}>
              <span className="banner-icon"><WarningIcon width={18} height={18} color="var(--red)" /></span>
              <p className="banner-title" style={{ color: 'var(--red)' }}>Some transfers are missing</p>
            </div>
          )}
          {result.details.map((d, i) => (
            <div className="row" key={i}>
              <div className="row-main">
                <div className="row-title">{d.category}</div>
                {d.status === 'MISSING' && <div className="row-meta">expected {usd(d.expected)} · actual {usd(d.actual)}</div>}
              </div>
              {chip(d)}
            </div>
          ))}
          {!result.allGood && (
            <p style={{marginBottom:0, marginTop:12}}>
              <a className="quiet" href="https://myaccounts.capitalone.com/" target="_blank" rel="noreferrer" style={{color:'var(--amber)'}}>
                Open Capital One to fix →
              </a>
            </p>
          )}
          <div style={{marginTop:12}}>
            <button className="btn btn-ghost btn-sm" onClick={verify} disabled={busy}>{busy ? 'Checking…' : 'Re-verify'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
