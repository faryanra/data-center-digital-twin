'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, AlertTriangle, AlertCircle } from 'lucide-react';
import type { AlarmRow } from '@dctwin/types';

const API = '/api/proxy';

type TabId = 'alarms' | 'warnings';

function timeAgo(tsMs: number): string {
  const s = Math.floor((Date.now() - tsMs) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function NotificationBell({ alarmCount }: { alarmCount: number }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>('alarms');
  const [rows, setRows] = useState<AlarmRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`${API}/alarms?state=active&limit=20`, { cache: 'no-store' });
      if (!res.ok) { setError(true); return; }
      const data = await res.json() as unknown;
      const list = Array.isArray(data) ? (data as AlarmRow[]) : ((data as { alarms?: AlarmRow[] }).alarms ?? []);
      setRows(list);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  // Fetch when the panel opens.
  useEffect(() => {
    if (open) void load();
  }, [open]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const critical = rows.filter(r => r.severity === 'CRITICAL');
  const warnings = rows.filter(r => r.severity === 'WARNING');
  const shown = tab === 'alarms' ? critical : warnings;

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Notifications"
        aria-expanded={open}
        className="relative text-[var(--muted)] hover:text-[var(--text)]"
      >
        <Bell className="h-5 w-5" />
        {alarmCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--warn)] text-[12px] font-bold text-black">
            {alarmCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 360, zIndex: 50,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, boxShadow: '0 8px 28px rgba(0,0,0,0.28)', overflow: 'hidden',
          }}
        >
          {/* Header + tabs */}
          <div style={{ padding: '12px 14px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
              Notifications
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              {([['alarms', 'Alarms', critical.length], ['warnings', 'Warnings', warnings.length]] as const).map(
                ([id, label, count]) => (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    style={{
                      padding: '0 0 10px', fontSize: 13, fontWeight: tab === id ? 700 : 500,
                      color: tab === id ? 'var(--text)' : 'var(--muted)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    {label}
                    {count > 0 && (
                      <span style={{
                        background: id === 'alarms' ? '#DC2626' : '#D97706', color: '#fff',
                        borderRadius: 10, padding: '0 6px', fontSize: 11, fontWeight: 700,
                      }}>
                        {count}
                      </span>
                    )}
                  </button>
                ),
              )}
            </div>
          </div>

          {/* Body */}
          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '28px 14px', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
                Loading…
              </div>
            ) : error ? (
              <div style={{ padding: '28px 14px', textAlign: 'center', fontSize: 13, color: '#DC2626' }}>
                Couldn’t reach the alarm service.
              </div>
            ) : shown.length === 0 ? (
              <div style={{ padding: '28px 14px', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
                No active {tab === 'alarms' ? 'critical alarms' : 'warnings'}.
              </div>
            ) : (
              shown.map(a => {
                const isCrit = a.severity === 'CRITICAL';
                const color = isCrit ? '#DC2626' : '#D97706';
                const Icon = isCrit ? AlertCircle : AlertTriangle;
                return (
                  <div
                    key={a.id}
                    style={{
                      display: 'flex', gap: 10, padding: '12px 14px',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <Icon className="h-4 w-4" style={{ color, flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                        {a.message}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        {a.source} · {timeAgo(a.raised_at * 1000)}
                      </div>
                    </div>
                    <Link
                      href="/alarms"
                      onClick={() => setOpen(false)}
                      style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', flexShrink: 0, whiteSpace: 'nowrap' }}
                    >
                      View →
                    </Link>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <Link
            href="/alarms"
            onClick={() => setOpen(false)}
            style={{
              display: 'block', textAlign: 'center', padding: '10px 14px',
              fontSize: 13, fontWeight: 600, color: 'var(--accent)',
              borderTop: '1px solid var(--border)', background: 'var(--bg)',
            }}
          >
            View all alarms
          </Link>
        </div>
      )}
    </div>
  );
}
