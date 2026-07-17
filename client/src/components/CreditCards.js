import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const usd = (n) => (typeof n === 'number' ? n : 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const statusLabel = (c) => {
  if (c.status === 'overdue') return `${c.daysOverdue} day${c.daysOverdue === 1 ? '' : 's'} overdue (was due ${c.dateStr})`;
  if (c.status === 'due_today') return 'Due today';
  if (c.status === 'upcoming') return `Due ${c.dateStr}`;
  return 'Due date unknown';
};
const statusChipClass = (c) => c.status === 'overdue' ? 'bad' : c.status === 'due_today' ? 'bad' : c.status === 'upcoming' ? 'neutral' : 'neutral';

export default function CreditCards({ token }) {
  const [cards, setCards] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ name: '', minimum: '', due_day: '' });

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const load = () => {
    fetch('/api/cards', { headers }).then(r => r.json()).then(setCards).catch(e => setError(e.message));
  };
  useEffect(load, [token]);

  const addCard = (e) => {
    e.preventDefault();
    if (!form.name || !form.minimum) return;
    fetch('/api/cards', { method: 'POST', headers, body: JSON.stringify({ name: form.name, minimum: parseFloat(form.minimum), due_day: form.due_day ? parseInt(form.due_day, 10) : null }) })
      .then(() => { setForm({ name: '', minimum: '', due_day: '' }); load(); });
  };
  const markPaid = (id) => fetch(`/api/cards/${id}/mark-paid`, { method: 'POST', headers }).then(load);
  const removeCard = (id) => fetch(`/api/cards/${id}`, { method: 'DELETE', headers }).then(load);

  const total = (cards || []).reduce((s, c) => s + c.minimum, 0);
  const overdueCount = (cards || []).filter(c => c.status === 'overdue').length;

  return (
    <div className="container">
      <div className="topbar">
        <div className="brand"><span className="brand-dot" />Credit cards</div>
        <Link to="/dashboard" className="btn btn-ghost btn-sm">Back</Link>
      </div>

      {error && <p className="error-text">{error}</p>}

      {overdueCount > 0 && (
        <div className="card" style={{ borderColor: 'var(--red)' }}>
          <p className="error-text" style={{ margin: 0, fontWeight: 600 }}>
            {overdueCount} card{overdueCount === 1 ? '' : 's'} overdue
          </p>
        </div>
      )}

      <div className="card">
        <div className="row"><span className="muted">Total minimums (all cards)</span><span className="row-amount">{usd(total)}/mo</span></div>
      </div>

      <div className="card">
        <h3 className="section-title">Cards</h3>
        {(cards || []).map(c => (
          <div className="row" key={c.id} style={{ alignItems: 'flex-start' }}>
            <span>{c.name}
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                {c.last_paid && `last paid ${c.last_paid.slice(0, 10)}`}
              </div>
              <div style={{ marginTop: 4, display: 'flex', gap: 12 }}>
                <button className="quiet" style={{ fontSize: 12 }} onClick={() => markPaid(c.id)}>Mark paid</button>
                <button className="quiet" style={{ fontSize: 12 }} onClick={() => removeCard(c.id)}>Remove</button>
              </div>
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <span className="row-amount">{usd(c.minimum)}</span>
              <span className={`chip ${statusChipClass(c)}`}>{statusLabel(c)}</span>
            </span>
          </div>
        ))}
        {cards && cards.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No cards yet.</p>}
      </div>

      <div className="card">
        <h3 className="section-title">Add a card</h3>
        <form onSubmit={addCard}>
          <div className="field"><input placeholder="Name (e.g. Citi)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input type="number" step="0.01" placeholder="Minimum $" value={form.minimum} onChange={e => setForm({ ...form, minimum: e.target.value })} />
            <input type="number" min="1" max="31" placeholder="Due day (1-31)" value={form.due_day} onChange={e => setForm({ ...form, due_day: e.target.value })} />
          </div>
          <button type="submit" className="btn btn-block" style={{ marginTop: 12 }}>Add card</button>
        </form>
      </div>
    </div>
  );
}
