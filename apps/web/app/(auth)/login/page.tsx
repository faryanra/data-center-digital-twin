'use client';

import { useState, useTransition } from 'react';
import { loginAction } from './actions';
import { AppLogo } from '@/components/AppLogo';

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 14,
  border: '1px solid var(--border)', background: 'var(--bg)',
  color: 'var(--text)', outline: 'none',
  boxSizing: 'border-box' as const,
};

export default function LoginPage() {
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError('');
    startTransition(async () => {
      const result = await loginAction(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <AppLogo />
          <h1 className="text-2xl font-bold text-[var(--text)]">Data Center Digital Twin</h1>
          <p className="text-sm text-[var(--muted)]">DC-NORTH-01 monitoring &amp; control</p>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{
            borderRadius: 12, padding: '36px 32px',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        >
          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="email"
              style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="you@datacenter.local"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="password"
              style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              style={inputStyle}
            />
          </div>

          {error && (
            <p style={{ fontSize: 14, color: 'var(--crit)', marginBottom: 12 }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={isPending}
            style={{
              width: '100%', padding: '12px 0', borderRadius: 8, marginTop: 8,
              fontSize: 14, fontWeight: 600, background: 'var(--accent)',
              color: '#fff', border: 'none',
              cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.6 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {isPending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
