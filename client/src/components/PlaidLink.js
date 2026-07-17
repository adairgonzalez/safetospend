import React, { useState, useEffect } from 'react';
import { usePlaidLink } from 'react-plaid-link';

export default function PlaidLink({ token }) {
  // Returning from a bank's OAuth page (e.g. Capital One): resume the same Link session
  const isOAuthRedirect = window.location.href.includes('oauth_state_id=');
  const [linkToken, setLinkToken] = useState(isOAuthRedirect ? localStorage.getItem('link_token') : null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOAuthRedirect) return;
    fetch('/api/plaid/create_link_token', { method:'POST', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'} })
      .then(r => r.json())
      .then(d => {
        if (d.link_token) { localStorage.setItem('link_token', d.link_token); setLinkToken(d.link_token); }
        else setError(d.error ? `Plaid error${d.error_code ? ` (${d.error_code})` : ''}: ${d.error}` : 'Could not get link token from server');
      })
      .catch(e => setError(`Could not reach server: ${e.message}`));
  }, [token, isOAuthRedirect]);

  const config = {
    token: linkToken,
    onSuccess: (public_token) => {
      fetch('/api/plaid/exchange_public_token', { method:'POST', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}, body:JSON.stringify({public_token}) })
        .then(() => { window.location.href = '/dashboard'; });
    },
    onExit: () => { if (isOAuthRedirect) window.location.href = '/dashboard'; },
  };
  if (isOAuthRedirect) config.receivedRedirectUri = window.location.href;

  const { open, ready } = usePlaidLink(config);

  useEffect(() => {
    if (isOAuthRedirect && ready) open();
  }, [isOAuthRedirect, ready, open]);

  if (isOAuthRedirect) return <div className="empty"><p className="muted">Finishing bank connection…</p></div>;
  return (
    <div>
      <button className="btn btn-block" onClick={() => open()} disabled={!ready}>Link bank account</button>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
