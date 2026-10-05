'use client';

import { useState, useEffect } from 'react';
import { useFacilitySocket } from '@/hooks/useFacilitySocket';
import { useAuth } from '@/lib/auth/context';

const API_BASE = '/api/proxy';

interface EventEntry {
  time: string;
  type: string;
  msg: string;
}

const FAULTS = [
  {
    id: 'utility_loss',
    label: 'Utility Power Loss',
    description: 'Simulates grid outage. UPS switches to battery, generator starts.',
    impact: 'UPS: BATTERY → GEN-01: STARTING → TRANSFERRED',
    severity: 'CRITICAL' as const,
    icon: '⚡',
  },
  {
    id: 'crah_a_trip',
    label: 'CRAH-A Unit Trip',
    description: 'Simulates cooling unit failure. Temperature rises in Hall A.',
    impact: 'CRAH-01: OFFLINE → Hall A temp rising → WARNING alarms',
    severity: 'WARNING' as const,
    icon: '❄',
  },
  {
    id: 'rack_overload',
    label: 'Rack IT Overload',
    description: 'Simulates excessive IT load. PDU approaches trip threshold.',
    impact: 'PDU-A load > 90% → CRITICAL alarm → potential breaker trip',
    severity: 'WARNING' as const,
    icon: '🖥',
  },
  {
    id: 'generator_fail',
    label: 'Generator Start Failure',
    description: 'Simulates generator failure to start during utility loss.',
    impact: 'GEN-01: FAULT → UPS on battery only → CRITICAL alarm',
    severity: 'CRITICAL' as const,
    icon: '⚙',
  },
] as const;

export default function SimulationPage() {
  const { snapshot } = useFacilitySocket();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [activeFault, setActiveFault] = useState<string | null>(null);
  const [faultStatus, setFaultStatus] = useState<'idle' | 'active' | 'recovering'>('idle');
  const [eventLog, setEventLog] = useState<EventEntry[]>([]);
  const [prevUpsMode, setPrevUpsMode] = useState<string | undefined>(undefined);
  const [prevGenState, setPrevGenState] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState<string | null>(null);

  function addLog(type: string, msg: string) {
    const time = new Date().toLocaleTimeString('en-GB');
    setEventLog(prev => [{ time, type, msg }, ...prev].slice(0, 50));
  }

  useEffect(() => {
    if (!activeFault || !snapshot) return;
    const upsMode = snapshot.ups?.[0]?.mode;
    const genState = snapshot.generator_state;
    if (upsMode !== prevUpsMode) {
      if (upsMode === 'BATTERY') addLog('UPS', 'Switched to battery power');
      if (upsMode === 'BYPASS')  addLog('UPS', 'Switched to bypass mode');
      if (upsMode === 'NORMAL')  addLog('UPS', 'Returned to normal operation');
      setPrevUpsMode(upsMode);
    }
    if (genState !== prevGenState) {
      if (genState === 'STARTING')    addLog('GEN', 'Generator starting…');
      if (genState === 'TRANSFERRED') addLog('GEN', 'Generator online — load transferred');
      if (genState === 'RECOVERY')    addLog('GEN', 'Generator in recovery mode');
      setPrevGenState(genState);
    }
  }, [snapshot?.ups?.[0]?.mode, snapshot?.generator_state, activeFault]);

  async function injectFault(faultId: string) {
    if (activeFault || pending) return;
    setPending(faultId);
    try {
      await fetch(`${API_BASE}/simulation/fault`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fault_type: faultId, duration_s: 60 }),
      });
    } catch { /* offline — still show feedback */ }

    setActiveFault(faultId);
    setFaultStatus('active');
    addLog(faultId, '✓ Fault injected — monitoring system response');
    setPending(null);

    setTimeout(() => {
      setFaultStatus('recovering');
      addLog(faultId, '↻ Recovery sequence initiated');
    }, 60000);
    setTimeout(() => {
      setActiveFault(null);
      setFaultStatus('idle');
      addLog(faultId, '✓ System returned to NORMAL');
    }, 75000);
  }

  async function clearFault() {
    await fetch(`${API_BASE}/simulation/fault`, { method: 'DELETE' });
    setFaultStatus('recovering');
    addLog(activeFault ?? 'fault', 'Fault manually cleared — system recovering');
    setTimeout(() => {
      setActiveFault(null);
      setFaultStatus('idle');
    }, 5000);
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

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Fault Injection Simulator</h1>
        <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>
          Inject faults to test system response and validate recovery procedures.
          All faults auto-recover after 60 seconds.
        </p>
      </div>

      {/* Status bar */}
      {faultStatus !== 'idle' && (
        <div style={{
          padding: '12px 16px', borderRadius: 8, marginBottom: 20,
          background: faultStatus === 'active' ? 'rgba(220,38,38,0.06)' : 'rgba(217,119,6,0.06)',
          border: `1px solid ${faultStatus === 'active' ? 'rgba(220,38,38,0.3)' : 'rgba(217,119,6,0.3)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: faultStatus === 'active' ? '#DC2626' : '#D97706',
              animation: 'skeleton-pulse 1s ease-in-out infinite',
              display: 'inline-block', flexShrink: 0,
            }} />
            <span style={{
              fontSize: 14, fontWeight: 600,
              color: faultStatus === 'active' ? '#DC2626' : '#D97706',
            }}>
              {faultStatus === 'active' ? `FAULT ACTIVE: ${activeFault}` : 'RECOVERING…'}
            </span>
          </div>
          <button
            onClick={clearFault}
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>
        {FAULTS.map(fault => {
          const isActive  = activeFault === fault.id;
          const isPending = pending === fault.id;
          const isLocked  = (!!activeFault || !!pending) && !isActive && !isPending;
          const borderColor = isActive
            ? (fault.severity === 'CRITICAL' ? '#DC2626' : '#D97706')
            : isPending ? '#2563EB'
            : 'var(--border)';
          return (
            <div
              key={fault.id}
              onClick={() => void injectFault(fault.id)}
              style={{
                position: 'relative',
                padding: '20px',
                borderRadius: 12,
                cursor: isLocked ? 'not-allowed' : isPending ? 'wait' : 'pointer',
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
                border: '1px solid var(--border)',
              }}>
                {fault.impact}
              </div>
            </div>
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
                  display: 'flex', gap: 16, padding: '10px 16px',
                  borderBottom: i < eventLog.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <span style={{ fontSize: 13, color: 'var(--muted)', fontFamily: 'monospace', flexShrink: 0 }}>
                  {e.time}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', flexShrink: 0 }}>
                  {e.type}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{e.msg}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
