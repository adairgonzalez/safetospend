import React, { useState, useEffect } from 'react';
import { usePlaidLink } from 'react-plaid-link';

export default function PlaidLink({ token }) {
  // Returning from a bank's OAuth page (e.g. Capital One): resume the same Link session
  const isOAuthRedirect = window.location.href.includes('oauth_state_id=');
  const [linkToken, setLinkToken] = useState(isOAuthRedirect ? localStorage.getItem('link_token') : null);

  useEffect(() => {
    if (isOAuthRedirect) return;
    fetch('/api/plaid/create_link_token', { method:'POST', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'} })
      .then(r => r.json()).then(d => { localStorage.setItem('link_token', d.link_token); setLinkToken(d.link_token); });
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

  if (isOAuthRedirect) return <div>Finishing bank connection...</div>;
  return <button onClick={() => open()} disabled={!ready} style={{padding:10,margin:10}}>Link Bank Account</button>;
}
