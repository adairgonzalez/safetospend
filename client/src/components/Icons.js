import React from 'react';

const base = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

export const HomeIcon = (p) => (
  <svg {...base} {...p}><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9a1 1 0 0 0 1 1H10a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h0a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h3.5a1 1 0 0 0 1-1v-9" /></svg>
);
export const ChartIcon = (p) => (
  <svg {...base} {...p}><path d="M4 20V10" /><path d="M12 20V4" /><path d="M20 20v-7" /></svg>
);
export const CardIcon = (p) => (
  <svg {...base} {...p}><rect x="2.5" y="5.5" width="19" height="13" rx="2.5" /><path d="M2.5 9.5h19" /><path d="M6 14.5h4" /></svg>
);
export const MoreIcon = (p) => (
  <svg {...base} {...p}><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" /></svg>
);
export const RefreshIcon = (p) => (
  <svg {...base} {...p}><path d="M20 11a8 8 0 0 0-14.9-4M4 5v5h5" /><path d="M4 13a8 8 0 0 0 14.9 4M20 19v-5h-5" /></svg>
);
export const CheckCircleIcon = (p) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.5 2.5L16 9" /></svg>
);
export const WarningIcon = (p) => (
  <svg {...base} {...p}><path d="M12 3.5 22 20H2Z" /><path d="M12 10v4" /><circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" /></svg>
);
export const LogoutIcon = (p) => (
  <svg {...base} {...p}><path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" /><path d="M15 16l4-4-4-4" /><path d="M19 12H9" /></svg>
);
export const ChevronRightIcon = (p) => (
  <svg {...base} {...p}><path d="m9 6 6 6-6 6" /></svg>
);
export const SlidersIcon = (p) => (
  <svg {...base} {...p}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h13M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="17" cy="18" r="2" /></svg>
);
export const ListIcon = (p) => (
  <svg {...base} {...p}><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4.5 6h0M4.5 12h0M4.5 18h0" strokeWidth="3" /></svg>
);
export const PlugIcon = (p) => (
  <svg {...base} {...p}><path d="M9 2v5M15 2v5" /><path d="M6 7h12l-1 5a5 5 0 0 1-5 4h0a5 5 0 0 1-5-4Z" /><path d="M12 16v6" /></svg>
);
export const SparkleIcon = (p) => (
  <svg {...base} {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="m7 7 2 2M15 15l2 2M17 7l-2 2M9 15l-2 2" /></svg>
);
export const WalletIcon = (p) => (
  <svg {...base} {...p}><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a2 2 0 0 1 2 2v1" /><rect x="3" y="8" width="18" height="12" rx="2.5" /><path d="M15 14.2a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6Z" fill="currentColor" stroke="none" /></svg>
);
export const ClockIcon = (p) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
);
export const ArrowUpIcon = (p) => (
  <svg {...base} {...p}><path d="M12 19V5M6 11l6-6 6 6" /></svg>
);
export const TrendDownIcon = (p) => (
  <svg {...base} {...p}><path d="M4 6l6.5 6.5L14 9l6 6" /><path d="M20 10v5h-5" /></svg>
);
export const CalendarIcon = (p) => (
  <svg {...base} {...p}><rect x="3.5" y="5" width="17" height="16" rx="2.5" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>
);
export const LockIcon = (p) => (
  <svg {...base} {...p}><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></svg>
);
