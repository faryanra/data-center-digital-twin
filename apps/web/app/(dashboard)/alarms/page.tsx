'use client';

import { useEffect, useRef, useState } from 'react';
import type { AlarmRow } from '@dctwin/types';
import { useAuth } from '@/lib/auth/context';

const API = '/api/proxy';

type TabId = 'active' | 'acknowledged' | 'cleared';

// Live alarms come from the alarm manager; cleared ones only exist in history.
interface DisplayAlarm extends Omit<AlarmRow, 'state'> {
  state: AlarmRow['state'] | 'CLEARED';
  cleared_at: number | null;
}

interface HistoryRow {
  alarm_id: string;
  severity: AlarmRow['severity'];
  status: string;
  equipment_id: string;
  message: string;
  triggered_at: string | null;
  acknowledged_at: string | null;
  cleared_at: string | null;
}

const isoToEpoch = (iso: string | null): number | null => (iso ? Date.parse(iso) / 1000 : null);

function fromHistory(h: HistoryRow): DisplayAlarm {
  return {
    id: h.alarm_id,
    severity: h.severity,
    source: h.equipment_id,
    message: h.message,
    state: 'CLEARED',
    raised_at: isoToEpoch(h.triggered_at) ?? 0,
    acked_by: null,
    acked_at: isoToEpoch(h.acknowledged_at),
    cleared_at: isoToEpoch(h.cleared_at),
  };
}

async function errorDetail(res: Response): Promise<string> {
  try {
    const body = await res.json() as { detail?: unknown };
    if (typeof body.detail === 'string') return body.detail;
  } catch { /* non-JSON body */ }
  return `HTTP ${res.status}`;
}

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
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [tab, setTab]           = useState<TabId>('active');
  const [alarms, setAlarms]     = useState<DisplayAlarm[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastFetchMs, setLastFetchMs] = useState<number | null>(null);
  const [activeCount, setActiveCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchAlarms(currentTab: TabId) {
    try {
      const url = currentTab === 'cleared'
        ? `${API}/alarms/history?status=CLEARED&limit=100`
        : `${API}/alarms?state=${currentTab}`;
      const res = await fetch(url);
      if (!res.ok) { setError(true); return; }
      const data = await res.json() as unknown;
      const rows: DisplayAlarm[] = currentTab === 'cleared'
        ? (data as HistoryRow[]).map(fromHistory)
        : (data as AlarmRow[]).map(a => ({ ...a, cleared_at: null }));
      setAlarms(rows);
      setError(false);
      setLastFetchMs(Date.now());
      if (currentTab === 'active') setActiveCount(rows.length);
    } catch {
      // Don't let a backend outage masquerade as "no active alarms".
      setError(true);
    } finally {
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

  async function runAction(label: string, request: () => Promise<Response>) {
    setActionError(null);
    try {
      const res = await request();
      if (!res.ok) setActionError(`${label} failed: ${await errorDetail(res)}`);
    } catch {
      setActionError(`${label} failed: backend unreachable`);
    }
    void fetchAlarms(tab);
    void fetchActiveCount();
  }

  function ackAlarm(id: string) {
    void runAction('Acknowledge', () => fetch(`${API}/alarms/${id}/acknowledge`, { method: 'POST' }));
  }

  function clearAlarm(id: string) {
    void runAction('Clear', () => fetch(`${API}/alarms/${id}`, { method: 'DELETE' }));
  }

  const critCount = alarms.filter(a => a.severity === 'CRITICAL').length;
  const warnCount = alarms.filter(a => a.severity === 'WARNING').length;
  const infoCount = alarms.filter(a => a.severity === 'INFO').length;

  const secondsAgo = lastFetchMs ? Math.floor((Date.now() - lastFetchMs) / 1000) : null;

  return (
    <div className="page-content">
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
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
        borderRadius: 4, width: 'fit-content', maxWidth: '100%', overflowX: 'auto',
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
      {actionError && (
        <div role="alert" style={{
          padding: '10px 14px', borderRadius: 4, fontSize: 13, color: '#DC2626',
          background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.3)',
        }}>
          {actionError}
        </div>
      )}

      {tab === 'active' && alarms.length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
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
      ) : error && alarms.length === 0 ? (
        <div style={{
          padding: '24px 20px', textAlign: 'center',
          background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.3)',
          borderRadius: 4,
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#DC2626', marginBottom: 4 }}>
            Couldn’t reach the alarm service
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            The backend is unreachable — this is not the same as “no active alarms”. Retrying every 15s.
          </div>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
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
                      {alarm.acked_by && ` by ${alarm.acked_by}`}
                      {alarm.cleared_at !== null && ` · Cleared ${timeAgo(alarm.cleared_at * 1000)}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
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
                    {isAdmin && alarm.state !== 'CLEARED' && (
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
                    )}
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
