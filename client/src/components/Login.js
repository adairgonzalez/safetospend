import React, { useState } from 'react';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const handle = async (e) => {
    e.preventDefault();
    const url = isRegister ? '/api/auth/register' : '/api/auth/login';
    const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username,password}) });
    const data = await res.json();
    if (data.token) onLogin(data.token);
  };
  return (
    <form onSubmit={handle} style={{maxWidth:300,margin:'100px auto'}}>
      <h2>{isRegister?'Register':'Login'}</h2>
      <input placeholder="Username" value={username} onChange={e=>setUsername(e.target.value)} style={{width:'100%',padding:10,marginBottom:10}} />
      <input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} style={{width:'100%',padding:10,marginBottom:10}} />
      <button type="submit" style={{width:'100%',padding:10}}>{isRegister?'Register':'Login'}</button>
      <button type="button" onClick={()=>setIsRegister(!isRegister)} style={{marginTop:10,background:'none',border:'none',color:'#aaa'}}>
        {isRegister ? 'Have an account? Login' : 'Create account'}
      </button>
    </form>
  );
}
