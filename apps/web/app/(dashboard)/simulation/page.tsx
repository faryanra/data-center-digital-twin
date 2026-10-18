'use client';

import { useEffect, useRef, useState } from 'react';
import { useFacilitySocket } from '@/hooks/useFacilitySocket';
import { useAuth } from '@/lib/auth/context';
import type { WsFaultType } from '@dctwin/types';

const API_BASE = '/api/proxy';
const FAULT_DURATION_S = 60;

interface EventEntry {
  time: string;
  type: string;
  msg: string;
  error?: boolean;
}

const FAULTS: {
  id: WsFaultType;
  label: string;
  description: string;
  impact: string;
  severity: 'CRITICAL' | 'WARNING';
  icon: string;
}[] = [
  {
    id: 'utility_loss',
    label: 'Utility Power Loss',
    description: 'Simulates grid outage. UPS switches to battery, generator starts.',
    impact: 'UPS: BATTERY → GEN-01: STARTING → TRANSFERRED',
    severity: 'CRITICAL',
    icon: '⚡',
  },
  {
    id: 'crah_a_trip',
    label: 'CRAH-A Unit Trip',
    description: 'Simulates cooling unit failure. Temperature rises in Hall A.',
    impact: 'CRAH 2/4 online → Hall A inlet rising → WARNING alarms',
    severity: 'WARNING',
    icon: '❄',
  },
  {
    id: 'rack_overload',
    label: 'Rack IT Overload',
    description: 'Racks A06–A10 draw 130 % of their rated power.',
    impact: 'Racks over rating → PDU-A load > 75 % → Hall A inlet rising',
    severity: 'WARNING',
    icon: '🖥',
  },
  {
    id: 'generator_fail',
    label: 'Generator Start Failure',
    description: 'Mains outage in which the generator fails to start.',
    impact: 'Utility lost → GEN-01: FAULT → UPS on battery only → CRITICAL',
    severity: 'CRITICAL',
    icon: '⚙',
  },
];

const FAULT_LABEL = Object.fromEntries(FAULTS.map(f => [f.id, f.label])) as Record<WsFaultType, string>;

async function errorDetail(res: Response): Promise<string> {
  try {
    const body = await res.json() as { detail?: unknown };
    if (typeof body.detail === 'string') return body.detail;
  } catch { /* non-JSON body */ }
  return `HTTP ${res.status}`;
}

export default function SimulationPage() {
  const { snapshot } = useFacilitySocket();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [eventLog, setEventLog] = useState<EventEntry[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const prevUpsMode = useRef<string | undefined>(undefined);
  const prevGenState = useRef<string | undefined>(undefined);
  const prevFaults = useRef<Set<string> | null>(null);

  // The server is the source of truth: faults survive navigation and are
  // shared by every viewer, so derive all fault UI from the snapshot.
  const activeFaults = snapshot?.active_faults ?? [];
  const activeIds = new Set<string>(activeFaults.map(f => f.fault));
  const remaining = activeFaults.reduce<number | null>(
    (max, f) => (f.remaining_s === null ? max : Math.max(max ?? 0, f.remaining_s)), null,
  );

  function addLog(type: string, msg: string, error = false) {
    const time = new Date().toLocaleTimeString('en-GB');
    setEventLog(prev => [{ time, type, msg, error }, ...prev].slice(0, 50));
  }

  useEffect(() => {
    if (!snapshot) return;
    const upsMode = snapshot.ups?.[0]?.mode;
    const genState = snapshot.generator_state;
    if (prevUpsMode.current !== undefined && upsMode !== prevUpsMode.current) {
      if (upsMode === 'BATTERY') addLog('UPS', 'Switched to battery power');
      if (upsMode === 'BYPASS')  addLog('UPS', 'Switched to bypass mode');
      if (upsMode === 'NORMAL')  addLog('UPS', 'Back to normal (on-line) operation');
    }
    if (prevGenState.current !== undefined && genState !== prevGenState.current) {
      if (genState === 'STARTING')    addLog('GEN', 'Generator starting…');
      if (genState === 'TRANSFERRED') addLog('GEN', 'Generator online — load transferred');
      if (genState === 'RECOVERY')    addLog('GEN', 'Mains restored — generator cooling down');
      if (genState === 'FAULT')       addLog('GEN', 'Generator failed to start', true);
    }
    prevUpsMode.current = upsMode;
    prevGenState.current = genState;

    const now = new Set<string>(snapshot.active_faults?.map(f => f.fault) ?? []);
    if (prevFaults.current) {
      for (const id of prevFaults.current) {
        if (!now.has(id)) addLog(id, '✓ Fault ended — system recovering');
      }
    }
    prevFaults.current = now;
  }, [snapshot]);

  async function injectFault(faultId: WsFaultType) {
    if (activeFaults.length > 0 || pending) return;
    setPending(faultId);
    try {
      const res = await fetch(`${API_BASE}/simulation/fault`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fault_type: faultId, duration_s: FAULT_DURATION_S }),
      });
      if (res.ok) {
        addLog(faultId, `✓ Fault injected for ${FAULT_DURATION_S} s — monitoring system response`);
      } else {
        addLog(faultId, `✕ Injection failed: ${await errorDetail(res)}`, true);
      }
    } catch {
      addLog(faultId, '✕ Injection failed: backend unreachable', true);
    } finally {
      setPending(null);
    }
  }

  async function clearFaults() {
    try {
      const res = await fetch(`${API_BASE}/simulation/fault`, { method: 'DELETE' });
      if (res.ok) addLog('fault', 'Faults cleared manually — system recovering');
      else addLog('fault', `✕ Clear failed: ${await errorDetail(res)}`, true);
    } catch {
      addLog('fault', '✕ Clear failed: backend unreachable', true);
    }
  }

  if (!isAdmin) {
    return (
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Fault Injection Simulator</h1>
        <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 32 }}>
          Inject scenarios for operator training — DC-NORTH-01
        </p>
        <div style={{ padding: '48px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Simulation requires ADMIN access</div>
          <div style={{ fontSize: 14, color: 'var(--muted)' }}>Contact your administrator to enable fault injection.</div>
        </div>
      </div>
    );
  }

  const bannerCritical = activeFaults.some(f => FAULTS.find(x => x.id === f.fault)?.severity === 'CRITICAL');

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Fault Injection Simulator</h1>
        <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>
          Faults run on the shared simulator, so every connected viewer sees them.
          Each fault ends automatically after {FAULT_DURATION_S} seconds.
        </p>
      </div>

      {/* Active-fault banner — rendered from the server snapshot */}
      {activeFaults.length > 0 && (
        <div style={{
          padding: '12px 16px', borderRadius: 8, marginBottom: 20,
          background: bannerCritical ? 'rgba(220,38,38,0.06)' : 'rgba(217,119,6,0.06)',
          border: `1px solid ${bannerCritical ? 'rgba(220,38,38,0.3)' : 'rgba(217,119,6,0.3)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: bannerCritical ? '#DC2626' : '#D97706',
              animation: 'skeleton-pulse 1s ease-in-out infinite',
              display: 'inline-block', flexShrink: 0,
            }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: bannerCritical ? '#DC2626' : '#D97706' }}>
              FAULT ACTIVE: {activeFaults.map(f => FAULT_LABEL[f.fault] ?? f.fault).join(' + ')}
              {remaining !== null && (
                <span style={{ fontWeight: 500, color: 'var(--muted)', marginLeft: 8 }}>
                  ends in ~{remaining} s
                </span>
              )}
            </span>
          </div>
          <button
            onClick={() => void clearFaults()}
            style={{
              padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)',
              fontSize: 13, cursor: 'pointer', background: 'var(--surface)', color: 'var(--text)',
            }}
          >
            Clear Fault
          </button>
        </div>
      )}

      {/* Fault cards */}
      <div className="grid-2" style={{ marginBottom: 28 }}>
        {FAULTS.map(fault => {
          const isActive  = activeIds.has(fault.id);
          const isPending = pending === fault.id;
          const isLocked  = (activeFaults.length > 0 || !!pending) && !isActive && !isPending;
          const borderColor = isActive
            ? (fault.severity === 'CRITICAL' ? '#DC2626' : '#D97706')
            : isPending ? '#2563EB'
            : 'var(--border)';
          return (
            <button
              key={fault.id}
              type="button"
              onClick={() => void injectFault(fault.id)}
              disabled={isLocked || isActive || isPending}
              style={{
                position: 'relative',
                padding: '20px',
                borderRadius: 12,
                textAlign: 'left',
                font: 'inherit',
                color: 'inherit',
                cursor: isLocked ? 'not-allowed' : isPending ? 'wait' : isActive ? 'default' : 'pointer',
                border: `${isActive || isPending ? '2px' : '1px'} solid ${borderColor}`,
                background: isActive
                  ? (fault.severity === 'CRITICAL' ? 'rgba(220,38,38,0.05)' : 'rgba(217,119,6,0.05)')
                  : isPending ? 'rgba(37,99,235,0.05)'
                  : 'var(--surface)',
                opacity: isLocked ? 0.45 : 1,
                transform: isPending ? 'scale(0.98)' : 'scale(1)',
                transition: 'all 0.18s ease',
                boxShadow: isActive ? `0 0 0 3px ${borderColor}22` : 'var(--shadow-sm)',
              }}
            >
              {isActive && (
                <div style={{
                  position: 'absolute', top: 12, right: 12,
                  padding: '3px 8px', borderRadius: 4,
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                  background: fault.severity === 'CRITICAL' ? '#DC2626' : '#D97706',
                  color: '#fff', textTransform: 'uppercase',
                  animation: 'skeleton-pulse 2s infinite',
                }}>● ACTIVE</div>
              )}
              {isPending && (
                <div style={{
                  position: 'absolute', top: 12, right: 12,
                  padding: '3px 8px', borderRadius: 4,
                  fontSize: 11, fontWeight: 700,
                  background: 'rgba(37,99,235,0.12)', color: '#2563EB',
                }}>Sending…</div>
              )}
              <div style={{ fontSize: 24, marginBottom: 10 }}>{fault.icon}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{fault.label}</div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                  background: fault.severity === 'CRITICAL' ? 'rgba(220,38,38,0.1)' : 'rgba(217,119,6,0.1)',
                  color: fault.severity === 'CRITICAL' ? '#DC2626' : '#D97706',
                  textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, marginLeft: 8,
                }}>
                  {fault.severity}
                </span>
              </div>
              <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5 }}>
                {fault.description}
              </div>
              <div style={{
                fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace',
                padding: '6px 10px', background: 'var(--bg)', borderRadius: 4,
                border: '1px solid var(--border)', overflowWrap: 'anywhere',
              }}>
                {fault.impact}
              </div>
            </button>
          );
        })}
      </div>

      {/* Event log */}
      <div>
        <div style={{
          fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase',
          letterSpacing: '0.05em', marginBottom: 10,
        }}>
          Event Log
        </div>
        <div className="table-card">
          {eventLog.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
              No fault events in this session
            </div>
          ) : (
            eventLog.map((e, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', gap: 16, padding: '10px 16px', flexWrap: 'wrap',
                  borderBottom: i < eventLog.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <span style={{ fontSize: 13, color: 'var(--muted)', fontFamily: 'monospace', flexShrink: 0 }}>
                  {e.time}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', flexShrink: 0 }}>
                  {e.type}
                </span>
                <span style={{ fontSize: 13, color: e.error ? '#DC2626' : 'var(--text)' }}>{e.msg}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
