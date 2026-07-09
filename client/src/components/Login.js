import React, { useState } from 'react';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState(null);
  const handle = async (e) => {
    e.preventDefault();
    setError(null);
    const url = isRegister ? '/api/auth/register' : '/api/auth/login';
    try {
      const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username,password}) });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (data.token) onLogin(data.token);
      else setError(data.error || `Server error (${res.status}) — is the backend running?`);
    } catch (err) {
      setError(`Could not reach server: ${err.message}`);
    }
  };
  return (
    <div className="auth">
      <div className="brand" style={{marginBottom:24}}><span className="brand-dot" />Safe to Spend</div>
      <div className="card">
        <h1>{isRegister ? 'Create account' : 'Welcome back'}</h1>
        <p className="sub">{isRegister ? 'One account, zero willpower required.' : 'Log in to see what you can spend.'}</p>
        {error && <p className="error-text">{error}</p>}
        <form onSubmit={handle}>
          <div className="field"><input placeholder="Username" value={username} onChange={e=>setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" /></div>
          <div className="field"><input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} /></div>
          <button type="submit" className="btn btn-block">{isRegister ? 'Register' : 'Log in'}</button>
        </form>
        <div className="link-row" style={{marginTop:16}}>
          <button type="button" className="quiet" onClick={()=>setIsRegister(!isRegister)}>
            {isRegister ? 'Have an account? Log in' : "New here? Create an account"}
          </button>
        </div>
      </div>
    </div>
  );
}
