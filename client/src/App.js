import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import BillTemplateForm from './components/BillTemplateForm';
import PlaidLink from './components/PlaidLink';
import TransactionsDebug from './components/TransactionsDebug';
import Insights from './components/Insights';
import CreditCards from './components/CreditCards';
import More from './components/More';
import BottomNav from './components/BottomNav';

function AppShell({ token, qa, overdueCount, login, logout }) {
  const location = useLocation();
  const showNav = !!token && location.pathname !== '/' && location.pathname !== '/oauth-return';
  return (
    <>
      {qa && <div className="qa-banner">QA · Sandbox data — not your real money</div>}
      <Routes>
        <Route path="/" element={token ? <Navigate to="/dashboard" /> : <Login onLogin={login} />} />
        <Route path="/dashboard" element={token ? <Dashboard token={token} onLogout={logout} /> : <Navigate to="/" />} />
        <Route path="/template" element={token ? <BillTemplateForm token={token} /> : <Navigate to="/" />} />
        <Route path="/oauth-return" element={token ? <PlaidLink token={token} /> : <Navigate to="/" />} />
        <Route path="/debug" element={token ? <TransactionsDebug token={token} /> : <Navigate to="/" />} />
        <Route path="/insights" element={token ? <Insights token={token} /> : <Navigate to="/" />} />
        <Route path="/cards" element={token ? <CreditCards token={token} /> : <Navigate to="/" />} />
        <Route path="/more" element={token ? <More onLogout={logout} /> : <Navigate to="/" />} />
      </Routes>
      {showNav && <BottomNav overdueCount={overdueCount} />}
    </>
  );
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [qa, setQa] = useState(false);
  const [overdueCount, setOverdueCount] = useState(0);
  const login = (t) => { localStorage.setItem('token', t); setToken(t); };
  const logout = () => { localStorage.removeItem('token'); setToken(null); };

  useEffect(() => {
    fetch('/api/meta').then(r => r.json()).then(d => setQa(!!d.qa)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch('/api/cards', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(cards => { if (Array.isArray(cards)) setOverdueCount(cards.filter(c => c.status === 'overdue').length); })
      .catch(() => {});
  }, [token]);

  return (
    <BrowserRouter>
      <AppShell token={token} qa={qa} overdueCount={overdueCount} login={login} logout={logout} />
    </BrowserRouter>
  );
}
export default App;
