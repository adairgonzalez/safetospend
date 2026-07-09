import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const defaultCategories = [
  { category: 'Rent', amount: 718 },
  { category: 'Tesla', amount: 430 },
  { category: 'Insurance', amount: 115 },
  { category: 'Electricity', amount: 51 },
  { category: 'Credit Card Minimums', amount: 475 },
  { category: 'Extra Debt Payment', amount: 750 },
];

export default function BillTemplateForm({ token }) {
  const [categories, setCategories] = useState(defaultCategories);
  const navigate = useNavigate();
  useEffect(() => {
    fetch('/api/template', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(data => { if (Array.isArray(data) && data.length) setCategories(data); });
  }, [token]);

  const save = () => {
    fetch('/api/template', { method:'POST', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}, body:JSON.stringify({categories}) })
      .then(() => navigate('/dashboard'));
  };

  const total = categories.reduce((s, c) => s + (c.amount || 0), 0);

  return (
    <div className="container" style={{maxWidth:480}}>
      <div className="topbar">
        <div className="brand"><span className="brand-dot" />Bill template</div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard')}>Back</button>
      </div>
      <div className="card">
        <h3 className="section-title">Per paycheck</h3>
        {categories.map((c, i) => (
          <div key={i} style={{display:'flex', gap:10, marginBottom:10}}>
            <input value={c.category} onChange={e => { const n = [...categories]; n[i] = {...n[i], category: e.target.value}; setCategories(n); }} />
            <input type="number" style={{maxWidth:120}} value={c.amount} onChange={e => { const n = [...categories]; n[i] = {...n[i], amount: parseFloat(e.target.value)||0}; setCategories(n); }} />
          </div>
        ))}
        <div className="row" style={{marginTop:6}}>
          <span className="muted">Total set aside</span>
          <span className="row-amount">{total.toLocaleString('en-US',{style:'currency',currency:'USD'})}</span>
        </div>
        <button className="btn btn-block" style={{marginTop:16}} onClick={save}>Save</button>
      </div>
    </div>
  );
}
