import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildFinancialSummary } from '../utils/financialSummary';
import { SparkleIcon } from './Icons';

// Unlike the Paycheck Plan auditor (gated behind the checklist by design),
// this is a general, always-available "ask anything about my finances"
// chat - no lock, just a running conversation grounded in a live snapshot
// of the same data every other page shows.
export default function AiChat({ token }) {
  const [summary, setSummary] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const navigate = useNavigate();
  const bottomRef = useRef(null);

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch('/api/transactions/safe-to-spend', { headers }).then(r => r.json()),
      fetch('/api/verify/verify-transfers', { method: 'POST', headers }).then(r => r.json()).catch(() => null),
      fetch('/api/insights/history', { headers }).then(r => r.json()).catch(() => ({ history: [] })),
      fetch('/api/insights/bills-account', { headers }).then(r => r.json()).catch(() => ({ accounts: [] })),
      fetch('/api/cards', { headers }).then(r => r.json()).catch(() => []),
    ]).then(([data, verify, h, b, cards]) => {
      if (data.error) { setLoadError(data.error); return; }
      setSummary(buildFinancialSummary({
        data, verify, history: h.history || [], billsAccounts: b.accounts || [], cards: Array.isArray(cards) ? cards : [],
      }));
    }).catch(e => setLoadError(e.message));
  }, [token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  const send = (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending || !summary) return;
    const nextMessages = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    setSending(true);
    setSendError(null);
    fetch('/api/ai/chat', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary, messages: nextMessages }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setSendError(d.error); setSending(false); return; }
        setMessages(m => [...m, { role: 'assistant', content: d.reply }]);
        setSending(false);
      })
      .catch(e => { setSendError(e.message); setSending(false); });
  };

  return (
    <div className="page" style={{ paddingBottom: 'calc(var(--nav-h) + env(safe-area-inset-bottom) + 96px)' }}>
      <div className="topbar">
        <div className="brand"><span className="brand-dot" />Ask AI</div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard')}>Back</button>
      </div>

      {loadError && <div className="card empty"><p>{loadError}</p></div>}

      {!loadError && !summary && (
        <>
          <div className="skel skel-row" /><div className="skel skel-row" />
        </>
      )}

      {summary && messages.length === 0 && (
        <div className="card">
          <h3 className="section-title"><SparkleIcon width={14} height={14} />Ask anything</h3>
          <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
            This has your current safe-to-spend, bills, cards, balances, and recent history — ask about any of it. "Can I afford X this cycle?", "which card should I pay off first?", "why is my safe-to-spend so low?"
          </p>
        </div>
      )}

      <div className="chat-list">
        {messages.map((m, i) => (
          <div className={`chat-msg ${m.role}`} key={i}>{m.content}</div>
        ))}
        {sending && <div className="chat-msg assistant chat-typing">Thinking…</div>}
        <div ref={bottomRef} />
      </div>

      {sendError && <p className="error-text" style={{ fontSize: 13 }}>{sendError}</p>}

      <form className="chat-input-bar" onSubmit={send}>
        <input
          placeholder={summary ? 'Ask about your finances…' : 'Loading your numbers…'}
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={!summary}
        />
        <button type="submit" className="btn btn-icon" disabled={!summary || !input.trim() || sending} aria-label="Send">
          <SparkleIcon width={18} height={18} />
        </button>
      </form>
    </div>
  );
}
