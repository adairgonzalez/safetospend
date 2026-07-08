import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PlaidLink from './PlaidLink';
import VerificationPanel from './VerificationPanel';

export default function Dashboard({ token, onLogout }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch('/api/transactions/safe-to-spend', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setData);
  }, [token]);

  if (!data) return <div>Loading...</div>;
  if (data.error) return <div>{data.error} <PlaidLink token={token} /></div>;

  const color = data.safeToSpend < 0 ? 'red' : data.safeToSpend < 50 ? 'orange' : 'lightgreen';
  return (
    <div style={{maxWidth:600,margin:'0 auto'}}>
      <div style={{display:'flex',justifyContent:'space-between'}}>
        <h2>Safe to Spend</h2>
        <button onClick={onLogout} style={{background:'none',color:'white',border:'1px solid white',padding:5}}>Logout</button>
      </div>
      <div style={{textAlign:'center',fontSize:'4rem',color}}>${data.safeToSpend?.toFixed(2)}</div>
      <p>Paycheck: ${data.paycheckAmount} on {data.paycheckDate}</p>
      <p>Next payday: {data.nextPayday} (in {Math.ceil((new Date(data.nextPayday)-new Date())/(1000*60*60*24))} days)</p>
      <div style={{background:'#2a2a2a',padding:10,borderRadius:5,marginTop:15}}>
        <h3>Transfers Checklist</h3>
        {data.checklist?.map((c,i)=><div key={i}>💰 {c.description}</div>)}
      </div>
      <VerificationPanel token={token} />
      <div style={{marginTop:20}}>
        <Link to="/template" style={{color:'#aaa'}}>Edit Bill Template</Link>
      </div>
    </div>
  );
}
