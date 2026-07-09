import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import BillTemplateForm from './components/BillTemplateForm';
import PlaidLink from './components/PlaidLink';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [qa, setQa] = useState(false);
  const login = (t) => { localStorage.setItem('token', t); setToken(t); };
  const logout = () => { localStorage.removeItem('token'); setToken(null); };
  useEffect(() => {
    fetch('/api/meta').then(r => r.json()).then(d => setQa(!!d.qa)).catch(() => {});
  }, []);
  return (
    <BrowserRouter>
      {qa && <div className="qa-banner">QA · Sandbox data — not your real money</div>}
      <Routes>
        <Route path="/" element={token ? <Navigate to="/dashboard" /> : <Login onLogin={login} />} />
        <Route path="/dashboard" element={token ? <Dashboard token={token} onLogout={logout} /> : <Navigate to="/" />} />
        <Route path="/template" element={token ? <BillTemplateForm token={token} /> : <Navigate to="/" />} />
        <Route path="/oauth-return" element={token ? <PlaidLink token={token} /> : <Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
export default App;
