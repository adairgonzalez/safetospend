import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildFinancialSummary } from '../utils/financialSummary';
import { SparkleIcon, PlusIcon, ListIcon, CameraIcon, XIcon } from './Icons';

const STORAGE_KEY = 'sts_ai_chat_id';
const MAX_PHOTO_DIM = 1600;

// Downscales/re-encodes the picked file to keep uploads small and OCR fast -
// a phone camera photo can be several MB straight out of the camera.
const photoToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Could not read that file'));
  reader.onload = () => {
    const img = new Image();
    img.onerror = () => reject(new Error('That file doesn\'t look like an image'));
    img.onload = () => {
      let { width, height } = img;
      if (width > MAX_PHOTO_DIM || height > MAX_PHOTO_DIM) {
        const scale = MAX_PHOTO_DIM / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

// Unlike the Paycheck Plan auditor (gated behind the checklist by design),
// this is a general, always-available "ask anything about my finances"
// chat - no lock, just a running conversation grounded in a live snapshot
// of the same data every other page shows. Conversations persist server-side
// so navigating away and back (or reloading) doesn't lose them, and the
// active chat's id is remembered in localStorage across visits.
export default function AiChat({ token }) {
  const [summary, setSummary] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [chatId, setChatId] = useState(() => {
    const v = localStorage.getItem(STORAGE_KEY);
    return v ? Number(v) : null;
  });
  const [messages, setMessages] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [chatList, setChatList] = useState(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [photoError, setPhotoError] = useState(null);
  const navigate = useNavigate();
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  useEffect(() => {
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
  }, [headers]);

  // Rehydrate the active chat's messages on mount (or after switching chats).
  useEffect(() => {
    if (!chatId) { setMessages([]); return; }
    fetch(`/api/ai/chats/${chatId}`, { headers })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setChatId(null); localStorage.removeItem(STORAGE_KEY); return; }
        setMessages(d.messages || []);
      })
      .catch(() => {});
  }, [chatId, headers]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  const loadChatList = useCallback(() => {
    fetch('/api/ai/chats', { headers })
      .then(r => r.json())
      .then(d => setChatList(Array.isArray(d.chats) ? d.chats : []))
      .catch(() => setChatList([]));
  }, [headers]);

  const toggleHistory = () => {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next) loadChatList();
  };

  const switchChat = (id) => {
    setChatId(id);
    localStorage.setItem(STORAGE_KEY, String(id));
    setHistoryOpen(false);
    setSendError(null);
  };

  const newChat = () => {
    setChatId(null);
    localStorage.removeItem(STORAGE_KEY);
    setMessages([]);
    setHistoryOpen(false);
    setSendError(null);
  };

  const deleteChat = (id, e) => {
    e.stopPropagation();
    fetch(`/api/ai/chats/${id}`, { method: 'DELETE', headers }).then(() => {
      loadChatList();
      if (id === chatId) newChat();
    });
  };

  const pickPhoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError(null);
    photoToDataUrl(file).then(setPhoto).catch(err => setPhotoError(err.message));
  };

  const send = (e) => {
    e.preventDefault();
    const text = input.trim();
    if ((!text && !photo) || sending || !summary) return;
    const content = text || '📷 Photo';
    const nextMessages = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setInput('');
    const imageToSend = photo;
    setPhoto(null);
    setPhotoError(null);
    setSending(true);
    setSendError(null);
    fetch('/api/ai/chat', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary, messages: nextMessages, chatId, image: imageToSend || undefined }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setSendError(d.error); setSending(false); return; }
        setMessages(m => {
          const updated = [...m];
          if (d.userMessage) updated[updated.length - 1] = { role: 'user', content: d.userMessage };
          return [...updated, { role: 'assistant', content: d.reply }];
        });
        if (d.chatId && d.chatId !== chatId) {
          setChatId(d.chatId);
          localStorage.setItem(STORAGE_KEY, String(d.chatId));
        }
        setSending(false);
      })
      .catch(e2 => { setSendError(e2.message); setSending(false); });
  };

  return (
    <div className="page" style={{ paddingBottom: 'calc(var(--nav-h) + env(safe-area-inset-bottom) + 96px)' }}>
      <div className="topbar">
        <div className="brand"><span className="brand-dot" />Ask AI</div>
        <div className="topbar-actions">
          <button className="btn btn-ghost btn-icon" onClick={toggleHistory} aria-label="History"><ListIcon width={18} height={18} /></button>
          <button className="btn btn-ghost btn-icon" onClick={newChat} aria-label="New chat"><PlusIcon width={18} height={18} /></button>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard')}>Back</button>
        </div>
      </div>

      {historyOpen && (
        <div className="card">
          <h3 className="section-title">Past chats</h3>
          {chatList === null && <p className="muted" style={{ fontSize: 13 }}>Loading…</p>}
          {chatList?.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No saved chats yet.</p>}
          {chatList?.map(c => (
            <div className={`row row-accent ${c.id === chatId ? 'good' : ''}`} key={c.id} style={{ cursor: 'pointer' }} onClick={() => switchChat(c.id)}>
              <div className="row-main">
                <div className="row-title">{c.title || 'Untitled chat'}</div>
                <div className="row-meta">{c.updated_at?.slice(0, 16).replace('T', ' ')}</div>
              </div>
              <button className="quiet" onClick={(e) => deleteChat(c.id, e)}>Delete</button>
            </div>
          ))}
        </div>
      )}

      {loadError && <div className="card empty"><p>{loadError}</p></div>}

      {!loadError && !summary && (
        <>
          <div className="skel skel-row" /><div className="skel skel-row" />
        </>
      )}

      {summary && messages.length === 0 && !historyOpen && (
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
      {photoError && <p className="error-text" style={{ fontSize: 13 }}>{photoError}</p>}

      <form className="chat-input-bar" onSubmit={send}>
        {photo && (
          <div className="chat-photo-preview">
            <img src={photo} alt="Attached" />
            <button type="button" className="chat-photo-remove" onClick={() => setPhoto(null)} aria-label="Remove photo">
              <XIcon width={14} height={14} />
            </button>
          </div>
        )}
        <div className="chat-input-row">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={fileInputRef}
            onChange={pickPhoto}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={!summary}
            aria-label="Attach photo"
          >
            <CameraIcon width={18} height={18} />
          </button>
          <input
            placeholder={summary ? 'Ask about your finances…' : 'Loading your numbers…'}
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={!summary}
          />
          <button type="submit" className="btn btn-icon" disabled={!summary || (!input.trim() && !photo) || sending} aria-label="Send">
            <SparkleIcon width={18} height={18} />
          </button>
        </div>
      </form>
    </div>
  );
}
