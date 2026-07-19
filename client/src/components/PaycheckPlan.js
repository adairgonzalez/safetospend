import React, { useCallback, useEffect, useState } from 'react';
import AnimatedNumber from './AnimatedNumber';
import { computeDebtPlan } from '../utils/debtPlan';
import { CheckCircleIcon, SparkleIcon, ClockIcon, LockIcon } from './Icons';

const usd = (n) => (typeof n === 'number' ? n : 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const cardStatusLabel = (c) => {
  if (c.status === 'overdue') return `${c.daysOverdue} day${c.daysOverdue === 1 ? '' : 's'} overdue`;
  return 'due today';
};

// A game-checklist style summary of "what has to happen this paycheck" -
// bill transfers plus any card that's actively overdue/due today. Everything
// that isn't done yet blocks the "leftover money" section below it from
// showing at all, on purpose: the point is friction against treating unhandled
// obligations as free spending money.
export default function PaycheckPlan({ token, data, cards, reload }) {
  const [verify, setVerify] = useState(null);
  const [verifyLoading, setVerifyLoading] = useState(true);
  const [auditText, setAuditText] = useState(null);
  const [auditError, setAuditError] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [markingId, setMarkingId] = useState(null);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const loadVerify = useCallback(() => {
    setVerifyLoading(true);
    fetch('/api/verify/verify-transfers', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(v => { setVerify(v); setVerifyLoading(false); })
      .catch(() => setVerifyLoading(false));
  }, [token]);

  useEffect(() => { loadVerify(); }, [loadVerify]);

  const markCardPaid = (id) => {
    setMarkingId(id);
    fetch(`/api/cards/${id}/mark-paid`, { method: 'POST', headers })
      .then(() => { reload(); setMarkingId(null); });
  };

  if (!data || verifyLoading) {
    return (
      <div className="card">
        <h3 className="section-title"><ClockIcon width={14} height={14} />Paycheck plan</h3>
        <div className="skel skel-row" /><div className="skel skel-row" />
      </div>
    );
  }

  const billItems = (data.checklist || []).map((c, i) => {
    const detail = verify?.details?.find(d => d.category === c.category);
    const done = c.autopay || detail?.status === 'Transferred';
    return { key: `bill-${i}`, kind: 'bill', name: c.category, amount: c.amount, done, note: c.autopay ? 'auto-pay' : (detail ? detail.status : 'checking…') };
  });

  const cardItems = (cards || [])
    .filter(c => c.status === 'overdue' || c.status === 'due_today')
    .map(c => ({ key: `card-${c.id}`, kind: 'card', id: c.id, name: c.name, amount: c.minimum, done: false, note: cardStatusLabel(c) }));

  const items = [...billItems, ...cardItems];
  const doneCount = items.filter(i => i.done).length;
  const allDone = doneCount === items.length;
  const pct = items.length ? Math.round((doneCount / items.length) * 100) : 100;

  const debtPlan = computeDebtPlan(cards, data.safeToSpend);

  const askAuditor = () => {
    setAuditLoading(true);
    setAuditError(null);
    const payload = {
      cycle: {
        paycheckDate: data.paycheckDate, nextPayday: data.nextPayday, paycheckAmount: data.paycheckAmount,
        billsAllocated: data.billsAllocated, totalSpent: data.totalSpent, safeToSpend: data.safeToSpend,
        carryoverDeficit: data.carryoverDeficit,
      },
      checklist: items.map(i => ({ name: i.name, amount: i.amount, done: i.done, note: i.note })),
      debtPlan: { pool: debtPlan.pool, allocations: debtPlan.allocations, unallocated: debtPlan.unallocated, totalDebt: debtPlan.totalDebt },
    };
    fetch('/api/audit/review', { method: 'POST', headers, body: JSON.stringify(payload) })
      .then(r => r.json())
      .then(d => {
        if (d.error) setAuditError(d.error);
        else setAuditText(d.review);
        setAuditLoading(false);
      })
      .catch(e => { setAuditError(e.message); setAuditLoading(false); });
  };

  return (
    <div className="card">
      <h3 className="section-title"><ClockIcon width={14} height={14} />Paycheck plan</h3>

      {items.length === 0 && (
        <p className="muted" style={{ fontSize: 13 }}>Nothing due right now — everything's handled.</p>
      )}

      {items.length > 0 && (
        <>
          <div className="hero-progress" style={{ marginTop: 2, marginBottom: 8 }}>
            <div className="hero-progress-fill" style={{ width: `${pct}%`, background: allDone ? undefined : 'linear-gradient(90deg,#fbbf24,#d97706)' }} />
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>{doneCount} of {items.length} handled</p>
          {items.map(item => (
            <div className="row" key={item.key}>
              <div className="row-main">
                <div className="row-title">
                  {item.done
                    ? <CheckCircleIcon width={16} height={16} color="var(--green)" />
                    : <span style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--border)', display: 'inline-block', flexShrink: 0 }} />}
                  {item.name}
                </div>
                <div className="row-meta">{item.note}</div>
              </div>
              <div className="row-side">
                <span className="row-amount">{usd(item.amount)}</span>
                {item.kind === 'card' && !item.done && (
                  <button className="quiet" onClick={() => markCardPaid(item.id)} disabled={markingId === item.id}>
                    {markingId === item.id ? 'Saving…' : 'Mark paid'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {!allDone && items.length > 0 && (
        <div className="banner info" style={{ marginTop: 4 }}>
          <span className="banner-icon"><LockIcon width={18} height={18} color="var(--muted)" /></span>
          <div>
            <p className="banner-title">Leftover money is locked</p>
            <p className="banner-body">Finish the checklist above to see what's safe to spend and where the rest should go.</p>
          </div>
        </div>
      )}

      {allDone && (
        <div style={{ marginTop: items.length ? 14 : 0, paddingTop: items.length ? 14 : 0, borderTop: items.length ? '1px solid var(--border-soft)' : 'none' }}>
          <div className="row">
            <span style={{ fontWeight: 700 }}>Leftover this cycle</span>
            <AnimatedNumber value={data.safeToSpend} className="row-amount" />
          </div>

          {debtPlan.debts.length > 0 && debtPlan.pool > 0 && (
            <>
              <p className="muted" style={{ fontSize: 13, margin: '10px 0' }}>Highest-interest-first, this is where it should go:</p>
              {debtPlan.allocations.map((a, i) => (
                <div className="row row-accent good" key={i}>
                  <div className="row-main">
                    <div className="row-title">{a.name}{a.promo && <span className="chip neutral">0% promo</span>}{a.payoff && <span className="chip ok">pays it off</span>}</div>
                    <div className="row-meta">{a.promo ? 'no interest either way' : a.apr != null ? `${a.apr}% APR` : 'APR unknown'}</div>
                  </div>
                  <span className="row-amount">{usd(a.amount)}</span>
                </div>
              ))}
            </>
          )}

          <button className="btn btn-block" style={{ marginTop: 14 }} onClick={askAuditor} disabled={auditLoading}>
            <SparkleIcon width={16} height={16} />{auditLoading ? 'Auditing…' : auditText ? 'Ask again' : 'Ask the AI auditor'}
          </button>
          {auditError && <p className="error-text" style={{ fontSize: 13 }}>{auditError}</p>}
          {auditText && (
            <div className="banner info" style={{ marginTop: 10 }}>
              <span className="banner-icon"><SparkleIcon width={17} height={17} color="var(--amber)" /></span>
              <div><p className="banner-body" style={{ color: 'var(--text)', lineHeight: 1.5 }}>{auditText}</p></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
