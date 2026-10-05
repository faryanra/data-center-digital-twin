'use client';

import { useEffect, useState } from 'react';

const API = '/api/proxy';

type UserRole = 'ADMIN' | 'OPERATOR';
type UserStatus = 'active' | 'disabled';

interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  created_at: number;
}

interface AddUserForm {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

const EMPTY_FORM: AddUserForm = { name: '', email: '', password: '', role: 'OPERATOR' };

function timeAgo(tsMs: number): string {
  const s = Math.floor((Date.now() - tsMs) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 4,
  border: '1px solid var(--border)', background: 'var(--bg)',
  color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 12, fontWeight: 500, color: 'var(--muted)',
  display: 'block', marginBottom: 5,
};

export function UsersClient() {
  const [users, setUsers]         = useState<UserRecord[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showAdd, setShowAdd]     = useState(false);
  const [form, setForm]           = useState<AddUserForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null);
  const [deleting, setDeleting]   = useState(false);

  async function fetchUsers() {
    try {
      const res = await fetch(`${API}/users`);
      if (!res.ok) return;
      const data = await res.json() as UserRecord[];
      setUsers(data);
    } catch { /* offline */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void fetchUsers(); }, []);

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json() as { detail?: string };
        setError(body.detail ?? 'Failed to create user');
        return;
      }
      setShowAdd(false);
      setForm(EMPTY_FORM);
      await fetchUsers();
    } catch {
      setError('Network error — try again');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`${API}/users/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      await fetchUsers();
    } catch { /* offline */ } finally {
      setDeleting(false);
    }
  }

  function setField<K extends keyof AddUserForm>(key: K, value: AddUserForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Users</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
            DC-NORTH-01 · access management
          </p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setError(null); }}
          style={{
            padding: '8px 16px', borderRadius: 6, border: 'none',
            background: 'var(--accent)', color: '#fff',
            fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}
        >
          + Add User
        </button>
      </div>

      {/* User table */}
      {loading ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
          Loading users…
        </div>
      ) : (
        <div className="table-card">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}>
                    No users found
                  </td>
                </tr>
              ) : users.map(u => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 500 }}>{u.name}</td>
                  <td style={{ color: 'var(--muted)' }}>{u.email}</td>
                  <td>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 3,
                      background: u.role === 'ADMIN' ? 'rgba(37,99,235,0.1)' : 'rgba(107,114,128,0.1)',
                      color: u.role === 'ADMIN' ? '#2563EB' : '#6B7280',
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>
                      {u.role}
                    </span>
                  </td>
                  <td>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 3,
                      background: u.status === 'active' ? 'rgba(16,185,129,0.1)' : 'rgba(220,38,38,0.1)',
                      color: u.status === 'active' ? '#059669' : '#DC2626',
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>
                      {u.status}
                    </span>
                  </td>
                  <td style={{ color: 'var(--muted)' }}>{timeAgo(u.created_at * 1000)}</td>
                  <td>
                    <button
                      onClick={() => setDeleteTarget(u)}
                      style={{
                        padding: '4px 10px', borderRadius: 4, fontSize: 12,
                        border: '1px solid rgba(220,38,38,0.35)',
                        background: 'transparent', color: '#DC2626', cursor: 'pointer',
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add User modal */}
      {showAdd && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.55)',
        }}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '28px 32px', width: 440, maxWidth: '90vw',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: '0 0 20px' }}>
              Add User
            </h2>
            <form onSubmit={e => void handleAddUser(e)}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={LABEL_STYLE}>Full name</label>
                  <input
                    required
                    style={INPUT_STYLE}
                    value={form.name}
                    onChange={e => setField('name', e.target.value)}
                    placeholder="Jane Smith"
                  />
                </div>
                <div>
                  <label style={LABEL_STYLE}>Email</label>
                  <input
                    required
                    type="email"
                    style={INPUT_STYLE}
                    value={form.email}
                    onChange={e => setField('email', e.target.value)}
                    placeholder="jane@datacenter.local"
                  />
                </div>
                <div>
                  <label style={LABEL_STYLE}>Password</label>
                  <input
                    required
                    type="password"
                    style={INPUT_STYLE}
                    value={form.password}
                    onChange={e => setField('password', e.target.value)}
                    placeholder="Minimum 8 characters"
                    minLength={8}
                  />
                </div>
                <div>
                  <label style={LABEL_STYLE}>Role</label>
                  <select
                    style={INPUT_STYLE}
                    value={form.role}
                    onChange={e => setField('role', e.target.value as UserRole)}
                  >
                    <option value="OPERATOR">OPERATOR</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </div>
                {error && (
                  <div style={{
                    fontSize: 13, color: '#DC2626',
                    padding: '8px 12px', borderRadius: 4,
                    background: 'rgba(220,38,38,0.07)',
                    border: '1px solid rgba(220,38,38,0.25)',
                  }}>
                    {error}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
                <button
                  type="button"
                  onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); setError(null); }}
                  style={{
                    padding: '8px 18px', borderRadius: 6, border: '1px solid var(--border)',
                    background: 'transparent', color: 'var(--text)', fontSize: 14, cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: '8px 18px', borderRadius: 6, border: 'none',
                    background: 'var(--accent)', color: '#fff',
                    fontSize: 14, fontWeight: 500, cursor: submitting ? 'wait' : 'pointer',
                    opacity: submitting ? 0.7 : 1,
                  }}
                >
                  {submitting ? 'Creating…' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.55)',
        }}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '28px 32px', width: 400, maxWidth: '90vw',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: '0 0 10px' }}>
              Remove User
            </h2>
            <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 20px', lineHeight: 1.55 }}>
              Remove <strong style={{ color: 'var(--text)' }}>{deleteTarget.name}</strong>{' '}
              ({deleteTarget.email})? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteTarget(null)}
                style={{
                  padding: '8px 18px', borderRadius: 6, border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--text)', fontSize: 14, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => void handleDelete()}
                disabled={deleting}
                style={{
                  padding: '8px 18px', borderRadius: 6, border: 'none',
                  background: '#DC2626', color: '#fff',
                  fontSize: 14, fontWeight: 500, cursor: deleting ? 'wait' : 'pointer',
                  opacity: deleting ? 0.7 : 1,
                }}
              >
                {deleting ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
