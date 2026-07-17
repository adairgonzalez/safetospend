import React from 'react';
import { Link } from 'react-router-dom';
import { SlidersIcon, ListIcon, PlugIcon, LogoutIcon, ChevronRightIcon } from './Icons';

export default function More({ onLogout }) {
  return (
    <div className="page">
      <div className="topbar">
        <div className="brand"><span className="brand-dot" />More</div>
      </div>

      <div className="card" style={{ padding: '4px 20px' }}>
        <Link to="/template" className="list-link">
          <span className="list-link-icon"><SlidersIcon width={18} height={18} /></span>
          Edit bill template
          <ChevronRightIcon width={18} height={18} className="list-link-arrow" />
        </Link>
        <Link to="/debug" className="list-link">
          <span className="list-link-icon"><ListIcon width={18} height={18} /></span>
          Raw transactions
          <ChevronRightIcon width={18} height={18} className="list-link-arrow" />
        </Link>
        <Link to="/debug" className="list-link">
          <span className="list-link-icon"><PlugIcon width={18} height={18} /></span>
          Webhook / bank connection
          <ChevronRightIcon width={18} height={18} className="list-link-arrow" />
        </Link>
      </div>

      <div className="card" style={{ padding: '4px 20px' }}>
        <button className="list-link" onClick={onLogout}>
          <span className="list-link-icon" style={{ color: 'var(--red)' }}><LogoutIcon width={18} height={18} /></span>
          Log out
        </button>
      </div>

      <p className="muted center" style={{ fontSize: 12.5, marginTop: 24 }}>Safe to Spend</p>
    </div>
  );
}
