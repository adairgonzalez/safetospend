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
      .then(r => r.json()).then(data => { if (data.length) setCategories(data); });
  }, [token]);

  const save = () => {
    fetch('/api/template', { method:'POST', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}, body:JSON.stringify({categories}) })
      .then(() => navigate('/dashboard'));
  };

  return (
    <div style={{maxWidth:400,margin:'20px auto'}}>
      <h2>Bill Template</h2>
      {categories.map((c,i) => (
        <div key={i} style={{marginBottom:8}}>
          <input value={c.category} onChange={e => { const n = [...categories]; n[i].category = e.target.value; setCategories(n); }} style={{width:'50%',padding:5}} />
          <input type="number" value={c.amount} onChange={e => { const n = [...categories]; n[i].amount = parseFloat(e.target.value)||0; setCategories(n); }} style={{width:'40%',padding:5}} />
        </div>
      ))}
      <button onClick={save} style={{padding:10,width:'100%'}}>Save</button>
      <button onClick={() => navigate('/dashboard')} style={{marginTop:5,background:'none',color:'white'}}>Back</button>
    </div>
  );
}
