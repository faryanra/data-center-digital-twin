'use client';

import { useEffect, useRef, useState } from 'react';
import type { AlarmRow } from '@dctwin/types';

const API = '/api/proxy';

type TabId = 'active' | 'acknowledged' | 'cleared';

function timeAgo(tsMs: number): string {
  const s = Math.floor((Date.now() - tsMs) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function sevColor(severity: string): string {
  if (severity === 'CRITICAL') return '#DC2626';
  if (severity === 'WARNING')  return '#D97706';
  return '#2563EB';
}

export default function AlarmsPage() {
  const [tab, setTab]           = useState<TabId>('active');
  const [alarms, setAlarms]     = useState<AlarmRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [lastFetchMs, setLastFetchMs] = useState<number | null>(null);
  const [activeCount, setActiveCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchAlarms(currentTab: TabId) {
    try {
      const res = await fetch(`${API}/alarms?state=${currentTab}`);
      if (!res.ok) return;
      const data = await res.json() as unknown;
      const rows = Array.isArray(data) ? (data as AlarmRow[]) : ((data as { alarms?: AlarmRow[] }).alarms ?? []);
      setAlarms(rows);
      setLastFetchMs(Date.now());
      if (currentTab === 'active') setActiveCount(rows.length);
    } catch { /* network offline */ } finally {
      setLoading(false);
    }
  }

  // Separate lightweight fetch just for the active badge count (tab-independent)
  async function fetchActiveCount() {
    try {
      const res = await fetch(`${API}/alarms?state=active`);
      if (!res.ok) return;
      const data = await res.json() as unknown;
      const rows = Array.isArray(data) ? (data as AlarmRow[]) : ((data as { alarms?: AlarmRow[] }).alarms ?? []);
      setActiveCount(rows.length);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    setLoading(true);
    void fetchAlarms(tab);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      void fetchAlarms(tab);
      if (tab !== 'active') void fetchActiveCount();
    }, 15_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function ackAlarm(id: string) {
    await fetch(`${API}/alarms/${id}/acknowledge`, { method: 'POST' });
    void fetchAlarms(tab);
  }

  async function clearAlarm(id: string) {
    await fetch(`${API}/alarms/${id}`, { method: 'DELETE' });
    void fetchAlarms(tab);
    void fetchActiveCount();
  }

  const critCount = alarms.filter(a => a.severity === 'CRITICAL').length;
  const warnCount = alarms.filter(a => a.severity === 'WARNING').length;
  const infoCount = alarms.filter(a => a.severity === 'INFO').length;

  const secondsAgo = lastFetchMs ? Math.floor((Date.now() - lastFetchMs) / 1000) : null;

  return (
    <div className="page-content">
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Alarms</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
            DC-NORTH-01 · alarm management
          </p>
        </div>
        {secondsAgo !== null && (
          <span style={{ fontSize: 14, color: 'var(--muted)' }}>
            Updated {secondsAgo < 5 ? 'just now' : `${secondsAgo}s ago`}
          </span>
        )}
      </div>

      {/* ── Tab pills ── */}
      <div style={{
        display: 'flex', gap: 4, padding: 4,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 4, width: 'fit-content',
      }}>
        {(['active', 'acknowledged', 'cleared'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '6px 16px', borderRadius: 2, fontSize: 14,
              fontWeight: tab === t ? 600 : 400,
              background: tab === t ? 'var(--accent)' : 'transparent',
              color: tab === t ? '#fff' : 'var(--muted)',
              border: 'none', cursor: 'pointer', textTransform: 'capitalize',
            }}
          >
            {t}
            {t === 'active' && activeCount > 0 && (
              <span style={{
                marginLeft: 6, background: '#DC2626', color: '#fff',
                borderRadius: 10, padding: '1px 6px', fontSize: 13, fontWeight: 700,
              }}>
                {activeCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Summary strip (active tab only) ── */}
      {tab === 'active' && alarms.length > 0 && (
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{
            padding: '8px 14px', borderRadius: 4,
            background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)',
            fontSize: 13, fontWeight: 600, color: '#DC2626',
          }}>
            {critCount} Critical
          </div>
          <div style={{
            padding: '8px 14px', borderRadius: 4,
            background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.3)',
            fontSize: 13, fontWeight: 600, color: '#D97706',
          }}>
            {warnCount} Warning
          </div>
          <div style={{
            padding: '8px 14px', borderRadius: 4,
            background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.3)',
            fontSize: 13, fontWeight: 600, color: '#2563EB',
          }}>
            {infoCount} Info
          </div>
        </div>
      )}

      {/* ── Content ── */}
      {loading ? (
        <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
          Loading alarms…
        </div>
      ) : alarms.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>
            {tab === 'active' ? '✓' : '—'}
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>
            {tab === 'active' ? 'No active alarms' : `No ${tab} alarms`}
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            {tab === 'active' ? 'All systems operating normally.' : ''}
          </div>
        </div>
      ) : (
        <div>
          {alarms.map(alarm => {
            const color = sevColor(alarm.severity);
            return (
              <div
                key={alarm.id}
                style={{
                  padding: '14px 16px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderLeft: `3px solid ${color}`,
                  borderRadius: 4,
                  marginBottom: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{
                        fontSize: 13, fontWeight: 700, color,
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>
                        {alarm.severity}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                        {alarm.source}
                      </span>
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>
                      {alarm.message}
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--muted)' }}>
                      Started {timeAgo(alarm.raised_at * 1000)}
                      {alarm.acked_at !== null && ` · Acknowledged ${timeAgo(alarm.acked_at * 1000)}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginLeft: 16, flexShrink: 0 }}>
                    {alarm.state === 'ACTIVE' && (
                      <button
                        onClick={() => void ackAlarm(alarm.id)}
                        style={{
                          padding: '6px 12px', fontSize: 13, fontWeight: 500, borderRadius: 2,
                          border: '1px solid var(--border)', background: 'var(--bg)',
                          color: 'var(--text)', cursor: 'pointer',
                        }}
                      >
                        Acknowledge
                      </button>
                    )}
                    <button
                      onClick={() => void clearAlarm(alarm.id)}
                      style={{
                        padding: '6px 12px', fontSize: 13, fontWeight: 500, borderRadius: 2,
                        border: '1px solid #DC2626', background: 'rgba(220,38,38,0.06)',
                        color: '#DC2626', cursor: 'pointer',
                      }}
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
