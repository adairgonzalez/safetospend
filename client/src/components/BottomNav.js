import React from 'react';
import { NavLink } from 'react-router-dom';
import { HomeIcon, ChartIcon, CardIcon, MoreIcon } from './Icons';

export default function BottomNav({ overdueCount = 0 }) {
  const items = [
    { to: '/dashboard', label: 'Home', Icon: HomeIcon },
    { to: '/insights', label: 'Insights', Icon: ChartIcon },
    { to: '/cards', label: 'Cards', Icon: CardIcon, badge: overdueCount > 0 },
    { to: '/more', label: 'More', Icon: MoreIcon },
  ];
  return (
    <nav className="bottom-nav">
      {items.map(({ to, label, Icon, badge }) => (
        <NavLink key={to} to={to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <span className="nav-dot" />
          <span style={{ position: 'relative' }}>
            <Icon width={22} height={22} />
            {badge && <span className="nav-badge" />}
          </span>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
