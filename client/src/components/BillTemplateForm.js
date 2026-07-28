import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const defaultCategories = [
  { category: 'Rent', amount: 718, due_day: null, pass_through: 0 },
  { category: 'Tesla', amount: 430, due_day: null, pass_through: 0 },
  { category: 'Insurance', amount: 115, due_day: null, pass_through: 0 },
  { category: 'Electricity', amount: 51, due_day: null, pass_through: 0 },
  { category: 'Credit Card Minimums', amount: 475, due_day: null, pass_through: 0 },
  { category: 'Extra Debt Payment', amount: 750, due_day: null, pass_through: 0 },
];

export default function BillTemplateForm({ token }) {
  const [categories, setCategories] = useState(defaultCategories);
  const [saved, setSaved] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    fetch('/api/template', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(data => { if (Array.isArray(data) && data.length) setCategories(data); });
  }, [token]);

  const save = () => {
    fetch('/api/template', { method:'POST', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}, body:JSON.stringify({categories}) })
      .then(() => { setSaved(true); setTimeout(() => navigate('/dashboard'), 500); });
  };

  const update = (i, patch) => { const n = [...categories]; n[i] = { ...n[i], ...patch }; setCategories(n); };
  const remove = (i) => setCategories(categories.filter((_, idx) => idx !== i));
  const addBill = () => setCategories([...categories, { category: '', amount: 0, due_day: null, pass_through: 0 }]);

  const total = categories.filter(c => !c.pass_through).reduce((s, c) => s + (c.amount || 0), 0);

  return (
    <div className="page" style={{maxWidth:480}}>
      <div className="topbar">
        <div className="brand"><span className="brand-dot" />Bill template</div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/more')}>Back</button>
      </div>
      <div className="card">
        <h3 className="section-title">Bills</h3>
        <p className="muted" style={{fontSize:12.5, lineHeight:1.5, marginBottom:14}}>
          Set a due day and this bill's <strong>full</strong> monthly amount only counts toward the one
          paycheck cycle it's actually due before — not every cycle. Leave due day blank to keep the old
          behavior (set aside every cycle, e.g. for an aggregate category like credit card minimums).
          Check "funded externally" for a bill someone else's money covers (e.g. they send you the money) —
          it still shows up as a reminder but won't reduce your own budget.
        </p>
        {categories.map((c, i) => (
          <div key={i} style={{marginBottom:14, paddingBottom:14, borderBottom: i < categories.length - 1 ? '1px solid var(--border-soft)' : 'none'}}>
            <div style={{display:'flex', gap:8, marginBottom:8}}>
              <input style={{flex:2}} placeholder="Category" value={c.category} onChange={e => update(i, { category: e.target.value })} />
              <input type="number" style={{flex:1, minWidth:0}} placeholder="Amount" value={c.amount} onChange={e => update(i, { amount: parseFloat(e.target.value)||0 })} />
              <input
                type="number" min="1" max="31" placeholder="Due day"
                style={{flex:1, minWidth:0}}
                value={c.due_day ?? ''}
                onChange={e => update(i, { due_day: e.target.value ? parseInt(e.target.value, 10) : null })}
              />
            </div>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <label className="muted" style={{fontSize:12.5, display:'flex', alignItems:'center', gap:6}}>
                <input type="checkbox" checked={!!c.pass_through} onChange={e => update(i, { pass_through: e.target.checked ? 1 : 0 })} />
                Funded externally (doesn't count against my budget)
              </label>
              <button className="quiet" onClick={() => remove(i)}>Remove</button>
            </div>
          </div>
        ))}
        <button className="btn btn-ghost btn-block" onClick={addBill}>+ Add bill</button>
        <div className="row" style={{marginTop:14}}>
          <span className="muted">Total monthly (from your paycheck)</span>
          <span className="row-amount">{total.toLocaleString('en-US',{style:'currency',currency:'USD'})}</span>
        </div>
        <button className="btn btn-block" style={{marginTop:16}} onClick={save} disabled={saved}>{saved ? 'Saved ✓' : 'Save'}</button>
      </div>
    </div>
  );
}
