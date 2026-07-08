import React, { useState } from 'react';

export default function VerificationPanel({ token }) {
  const [result, setResult] = useState(null);
  const verify = () => {
    fetch('/api/verify/verify-transfers', { method:'POST', headers:{Authorization:`Bearer ${token}`} })
      .then(r => r.json()).then(setResult);
  };
  return (
    <div style={{background:'#2a2a2a',padding:10,borderRadius:5,marginTop:15}}>
      <h3>Transfer Verification</h3>
      {!result && <button onClick={verify} style={{padding:10}}>Verify Transfers</button>}
      {result && (
        <div>
          <p style={{color: result.allGood ? 'lightgreen' : 'red'}}>{result.allGood ? '✅ All transfers confirmed' : '❌ Some transfers missing!'}</p>
          {result.details.map((d,i) => <div key={i}>{d.category}: {d.status} {d.expected && `(Expected ${d.expected}, actual ${d.actual})`}</div>)}
          {!result.allGood && <p><a href="https://myaccounts.capitalone.com/" target="_blank" rel="noreferrer" style={{color:'orange'}}>Go to Capital One to fix</a></p>}
          <button onClick={()=>setResult(null)} style={{marginTop:5}}>Re-verify</button>
        </div>
      )}
    </div>
  );
}
