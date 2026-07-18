import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WarningIcon, CardIcon } from './Icons';

const usd = (n) => (typeof n === 'number' ? n : 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const statusLabel = (c) => {
  if (c.status === 'overdue') return `${c.daysOverdue} day${c.daysOverdue === 1 ? '' : 's'} overdue`;
  if (c.status === 'due_today') return 'Due today';
  if (c.status === 'upcoming') return `Due ${c.dateStr}`;
  return 'Due date unknown';
};
const accentClass = (c) => c.status === 'overdue' || c.status === 'due_today' ? 'bad' : c.status === 'upcoming' ? 'warn' : '';

export default function CreditCards({ token }) {
  const [cards, setCards] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ name: '', minimum: '', due_day: '', balance: '', apr: '', credit_limit: '', closed: false });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', minimum: '', due_day: '', balance: '', apr: '', credit_limit: '', closed: false });
  const navigate = useNavigate();

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const load = () => {
    fetch('/api/cards', { headers }).then(r => r.json()).then(setCards).catch(e => setError(e.message));
  };
  useEffect(load, [token]);

  const addCard = (e) => {
    e.preventDefault();
    if (!form.name || !form.minimum) return;
    fetch('/api/cards', { method: 'POST', headers, body: JSON.stringify({
      name: form.name, minimum: parseFloat(form.minimum), due_day: form.due_day ? parseInt(form.due_day, 10) : null,
      balance: form.balance ? parseFloat(form.balance) : null, apr: form.apr ? parseFloat(form.apr) : null,
      credit_limit: form.credit_limit ? parseFloat(form.credit_limit) : null, closed: form.closed,
    }) })
      .then(() => { setForm({ name: '', minimum: '', due_day: '', balance: '', apr: '', credit_limit: '', closed: false }); setShowForm(false); load(); });
  };
  const markPaid = (id) => fetch(`/api/cards/${id}/mark-paid`, { method: 'POST', headers }).then(load);
  const removeCard = (id) => fetch(`/api/cards/${id}`, { method: 'DELETE', headers }).then(load);

  const startEdit = (c) => {
    setEditingId(c.id);
    setEditForm({ name: c.name, minimum: c.minimum, due_day: c.due_day || '', balance: c.balance ?? '', apr: c.apr ?? '', credit_limit: c.credit_limit ?? '', closed: !!c.closed });
  };
  const saveEdit = (e) => {
    e.preventDefault();
    if (!editForm.name || !editForm.minimum) return;
    fetch(`/api/cards/${editingId}`, { method: 'PUT', headers, body: JSON.stringify({
      name: editForm.name, minimum: parseFloat(editForm.minimum), due_day: editForm.due_day ? parseInt(editForm.due_day, 10) : null,
      balance: editForm.balance !== '' ? parseFloat(editForm.balance) : null, apr: editForm.apr !== '' ? parseFloat(editForm.apr) : null,
      credit_limit: editForm.credit_limit !== '' ? parseFloat(editForm.credit_limit) : null, closed: editForm.closed,
    }) })
      .then(() => { setEditingId(null); load(); });
  };

  const total = (cards || []).reduce((s, c) => s + c.minimum, 0);
  const totalDebt = (cards || []).reduce((s, c) => s + (c.balance || 0), 0);
  const overdueCards = (cards || []).filter(c => c.status === 'overdue');

  return (
    <div className="page">
      <div className="topbar">
        <div className="brand"><span className="brand-dot" />Credit cards</div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/more')}>Back</button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {overdueCards.length > 0 && (
        <div className="banner danger">
          <span className="banner-icon"><WarningIcon width={19} height={19} color="var(--red)" /></span>
          <div>
            <p className="banner-title" style={{ color: 'var(--red)' }}>{overdueCards.length} card{overdueCards.length === 1 ? '' : 's'} overdue</p>
            <p className="banner-body">{overdueCards.map(c => `${c.name} (${usd(c.minimum)})`).join(', ')}</p>
          </div>
        </div>
      )}

      <div className="stats">
        <div className="stat">
          <div className="stat-icon"><CardIcon width={16} height={16} color="var(--muted)" /></div>
          <div className="stat-label">Cards tracked</div>
          <div className="stat-value">{(cards || []).length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Total minimums</div>
          <div className="stat-value">{usd(total)}<span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>/mo</span></div>
        </div>
        <div className="stat">
          <div className="stat-label">Total balance</div>
          <div className="stat-value">{usd(totalDebt)}</div>
        </div>
      </div>

      <div className="card">
        <h3 className="section-title">Cards</h3>
        {(cards || []).map(c => editingId === c.id ? (
          <form onSubmit={saveEdit} key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-soft)' }}>
            <div className="field"><input placeholder="Name" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} autoFocus /></div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <input type="number" step="0.01" placeholder="Minimum $" value={editForm.minimum} onChange={e => setEditForm({ ...editForm, minimum: e.target.value })} />
              <input type="number" min="1" max="31" placeholder="Due day" value={editForm.due_day} onChange={e => setEditForm({ ...editForm, due_day: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <input type="number" step="0.01" placeholder="Balance $" value={editForm.balance} onChange={e => setEditForm({ ...editForm, balance: e.target.value })} />
              <input type="number" step="0.01" placeholder="APR %" value={editForm.apr} onChange={e => setEditForm({ ...editForm, apr: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <input type="number" step="0.01" placeholder="Credit limit $" value={editForm.credit_limit} onChange={e => setEditForm({ ...editForm, credit_limit: e.target.value })} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--muted)' }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={editForm.closed} onChange={e => setEditForm({ ...editForm, closed: e.target.checked })} />
              Card is closed (no longer accepting charges)
            </label>
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEditingId(null)}>Cancel</button>
              <button type="submit" className="btn" style={{ flex: 2 }}>Save</button>
            </div>
          </form>
        ) : (
          <div className={`row row-accent ${accentClass(c)}`} key={c.id}>
            <div className="row-main">
              <div className="row-title">{c.name}{c.closed ? <span className="chip neutral">closed</span> : null}</div>
              <div className="row-meta" style={{ color: c.status === 'overdue' ? 'var(--red)' : c.status === 'due_today' ? 'var(--amber)' : undefined, fontWeight: c.status === 'overdue' || c.status === 'due_today' ? 700 : 400 }}>
                {statusLabel(c)}{c.last_paid && c.status !== 'overdue' ? ` · last paid ${c.last_paid.slice(0, 10)}` : ''}
              </div>
              {(c.balance != null || c.apr != null) && (
                <div className="row-meta">
                  {c.balance != null ? `${usd(c.balance)} balance` : ''}{c.balance != null && c.apr != null ? ' · ' : ''}{c.apr != null ? `${c.apr}% APR` : ''}
                  {c.balance != null && c.credit_limit ? ` · ${Math.round((c.balance / c.credit_limit) * 100)}% utilized` : ''}
                </div>
              )}
              <div className="row-actions">
                <button className="quiet" onClick={() => markPaid(c.id)}>Mark paid</button>
                <button className="quiet" onClick={() => startEdit(c)}>Edit</button>
                <button className="quiet" onClick={() => removeCard(c.id)}>Remove</button>
              </div>
            </div>
            <span className="row-amount">{usd(c.minimum)}</span>
          </div>
        ))}
        {cards && cards.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No cards yet — add one below.</p>}
      </div>

      <div className="card">
        {!showForm ? (
          <button className="btn btn-ghost btn-block" onClick={() => setShowForm(true)}>+ Add a card</button>
        ) : (
          <>
            <h3 className="section-title">Add a card</h3>
            <form onSubmit={addCard}>
              <div className="field"><input placeholder="Name (e.g. Citi)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus /></div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <input type="number" step="0.01" placeholder="Minimum $" value={form.minimum} onChange={e => setForm({ ...form, minimum: e.target.value })} />
                <input type="number" min="1" max="31" placeholder="Due day (1-31)" value={form.due_day} onChange={e => setForm({ ...form, due_day: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <input type="number" step="0.01" placeholder="Balance $ (optional)" value={form.balance} onChange={e => setForm({ ...form, balance: e.target.value })} />
                <input type="number" step="0.01" placeholder="APR % (optional)" value={form.apr} onChange={e => setForm({ ...form, apr: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <input type="number" step="0.01" placeholder="Credit limit $ (optional)" value={form.credit_limit} onChange={e => setForm({ ...form, credit_limit: e.target.value })} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--muted)' }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={form.closed} onChange={e => setForm({ ...form, closed: e.target.checked })} />
                Card is closed (no longer accepting charges)
              </label>
              <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>Balance and APR power the debt payoff suggestion on the home dashboard.</p>
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn" style={{ flex: 2 }}>Add card</button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
