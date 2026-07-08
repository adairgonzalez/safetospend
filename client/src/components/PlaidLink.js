import React, { useState, useEffect } from 'react';
import { usePlaidLink } from 'react-plaid-link';

export default function PlaidLink({ token }) {
  const [linkToken, setLinkToken] = useState(null);
  useEffect(() => {
    fetch('/api/plaid/create_link_token', { method:'POST', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'} })
      .then(r => r.json()).then(d => setLinkToken(d.link_token));
  }, [token]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (public_token) => {
      fetch('/api/plaid/exchange_public_token', { method:'POST', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}, body:JSON.stringify({public_token}) })
        .then(() => window.location.reload());
    },
  });
  return <button onClick={() => open()} disabled={!ready} style={{padding:10,margin:10}}>Link Bank Account</button>;
}
