'use client';
import { useState } from 'react';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      const next = new URLSearchParams(window.location.search).get('next') || '/';
      window.location.href = next.startsWith('/') && !next.startsWith('//') ? next : '/';
    } else {
      setError((await res.json().catch(() => ({}))).error || 'Login failed');
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form onSubmit={submit} className="card login-card">
        <div className="logo">
          <BagIcon />
        </div>
        <h1>Wishlist</h1>
        <input
          type="password"
          autoFocus
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy || !password}>
          {busy ? 'Opening…' : 'Open'}
        </button>
      </form>
    </main>
  );
}

function BagIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z" />
      <path d="M9 10V7a3 3 0 0 1 6 0v3" />
    </svg>
  );
}
