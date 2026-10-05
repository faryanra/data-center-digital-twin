'use client';

import { useState } from 'react';
import { useFacilitySocket } from '@/hooks/useFacilitySocket';
import { useAuth } from '@/lib/auth/context';
import type { WsBranchCircuit } from '@dctwin/types';

const API_BASE = '/api/proxy/control';

const SECTIONS = [
  { id: 'cooling',   label: 'Cooling Control' },
  { id: 'ups',       label: 'UPS Control' },
  { id: 'generator', label: 'Generator' },
  { id: 'breakers',  label: 'Breaker Panel' },
] as const;

type SectionId = typeof SECTIONS[number]['id'];

// Backend accepts NORMAL | ECONOMY | EMERGENCY (see /control/cooling/mode).
const COOLING_MODES = ['NORMAL', 'ECONOMY', 'EMERGENCY'] as const;

type CmdResult = 'idle' | 'sending' | 'ok' | 'error';

// POST to a real backend control endpoint. `path` is relative to /control.
async function postControl(path: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Generic async action button with pending / ok / error feedback ──────────────

function ActionButton({
  label, onRun, danger = false, disabled = false,
}: {
  label: string;
  onRun: () => Promise<boolean>;
  danger?: boolean;
  disabled?: boolean;
}) {
  const [state, setState] = useState<CmdResult>('idle');

  async function handleClick() {
    if (disabled || state === 'sending') return;
    setState('sending');
    const ok = await onRun();
    setState(ok ? 'ok' : 'error');
    setTimeout(() => setState('idle'), 2500);
  }

  const text =
    state === 'sending' ? 'Sending…' :
    state === 'ok'      ? '✓ Applied' :
    state === 'error'   ? '✕ Failed' :
    label;

  const color =
    state === 'ok'    ? '#16A34A' :
    state === 'error' ? '#DC2626' :
    danger            ? '#DC2626' : 'var(--text)';

  const border =
    state === 'ok'    ? '1px solid rgba(22,163,74,0.4)' :
    state === 'error' ? '1px solid rgba(220,38,38,0.4)' :
    danger            ? '1px solid rgba(220,38,38,0.4)' : '1px solid var(--border)';

  return (
    <button
      onClick={handleClick}
      disabled={disabled || state === 'sending'}
      style={{
        padding: '12px 16px', borderRadius: 8, fontSize: 14, fontWeight: 500,
        border,
        background: state === 'ok' ? 'rgba(22,163,74,0.08)'
          : state === 'error' ? 'rgba(220,38,38,0.08)'
          : danger ? 'rgba(220,38,38,0.06)' : 'var(--surface)',
        color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.2s',
        width: '100%',
      }}
    >
      {text}
    </button>
  );
}

export function ControlsClient() {
  const { snapshot } = useFacilitySocket();
  const { user } = useAuth();
  // Backend permits OPERATOR + ADMIN on /control/*; this UI reserves writes for ADMIN.
  const isAdmin = user?.role === 'ADMIN';
  const readOnly = !isAdmin;

  const [activeSection, setActiveSection] = useState<SectionId>('cooling');
  const [setpoint, setSetpoint] = useState(snapshot?.crah_setpoint_c ?? 21);
  const [emergencyArmed, setEmergencyArmed] = useState(false);

  const ups0 = snapshot?.ups[0];
  const branches: WsBranchCircuit[] = snapshot?.power_distribution?.branches ?? [];
  const bypassOn = snapshot?.ups_bypass_enabled ?? (ups0?.mode === 'BYPASS');
  const autoStartOn = snapshot?.gen_auto_start ?? false;

  function renderSection() {
    switch (activeSection) {
      // ── Cooling ────────────────────────────────────────────────────────────
      case 'cooling':
        return (
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Cooling Control</h2>

            {/* CRAH Setpoint */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>CRAH Setpoint Temperature</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
                Supply-air temperature target for all CRAH units
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input
                  type="number"
                  min={15} max={30} step={0.5}
                  value={setpoint}
                  onChange={e => setSetpoint(+e.target.value)}
                  disabled={readOnly}
                  style={{
                    width: 80, padding: '8px 10px', fontSize: 16, fontWeight: 600,
                    border: '1px solid var(--border)', borderRadius: 8,
                    background: 'var(--surface)', color: 'var(--text)', textAlign: 'center',
                  }}
                />
                <span style={{ fontSize: 14, color: 'var(--muted)' }}>°C</span>
                <div style={{ width: 120 }}>
                  <ActionButton
                    label="Apply"
                    disabled={readOnly}
                    onRun={() => postControl('crah/setpoint', { setpoint_c: setpoint, zone: 'all' })}
                  />
                </div>
              </div>
              {snapshot?.crah_setpoint_c !== undefined && (
                <div style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)' }}>
                  Current: {snapshot.crah_setpoint_c.toFixed(1)} °C
                </div>
              )}
            </div>

            {/* Cooling Mode */}
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Cooling Mode</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
                Operating mode for the cooling plant
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {COOLING_MODES.map(mode => (
                  <div key={mode} style={{ flex: '0 0 auto', minWidth: 120 }}>
                    <ActionButton
                      label={mode}
                      disabled={readOnly}
                      onRun={() => postControl('cooling/mode', { mode })}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      // ── UPS ────────────────────────────────────────────────────────────────
      case 'ups':
        return (
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>UPS Control</h2>

            {ups0 && (
              <div style={{
                padding: '14px 16px', borderRadius: 8, marginBottom: 20,
                border: '1px solid var(--border)', background: 'var(--surface)',
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>
                  {ups0.id} STATUS
                </div>
                <div style={{ display: 'flex', gap: 24 }}>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>Mode</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: ups0.mode === 'FAULT' ? 'var(--crit)' : ups0.mode === 'NORMAL' ? 'var(--ok)' : 'var(--warn)' }}>
                      {ups0.mode}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>Load</div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{ups0.load_pct.toFixed(0)}%</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>Battery</div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{ups0.battery_pct.toFixed(0)}%</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>Input</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: ups0.input_ok ? 'var(--ok)' : 'var(--crit)' }}>
                      {ups0.input_ok ? 'OK' : 'FAULT'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Maintenance Bypass</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
              {bypassOn
                ? 'Bypass is active — load is on raw utility, not protected.'
                : 'Transfer the load to maintenance bypass (removes UPS protection).'}
            </div>
            <div style={{ maxWidth: 260 }}>
              <ActionButton
                label={bypassOn ? 'Return to Normal' : 'Enable Bypass'}
                danger={!bypassOn}
                disabled={readOnly}
                onRun={() => postControl('ups/bypass', { enabled: !bypassOn })}
              />
            </div>
          </div>
        );

      // ── Generator ────────────────────────────────────────────────────────────
      case 'generator':
        return (
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Generator</h2>

            <div style={{
              padding: '14px 16px', borderRadius: 8, marginBottom: 20,
              border: '1px solid var(--border)', background: 'var(--surface)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>GEN-01 STATUS</div>
              <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>State</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{snapshot?.generator_state ?? '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>Fuel</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>
                    {snapshot ? `${snapshot.generator_fuel_pct.toFixed(0)}%` : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>Auto-start</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: autoStartOn ? 'var(--ok)' : 'var(--muted)' }}>
                    {autoStartOn ? 'ARMED' : 'OFF'}
                  </div>
                </div>
              </div>
              {snapshot && (
                <div style={{ height: 6, background: 'var(--border)', borderRadius: 3 }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    width: `${snapshot.generator_fuel_pct}%`,
                    background: snapshot.generator_fuel_pct > 50 ? '#16A34A' : snapshot.generator_fuel_pct > 20 ? '#D97706' : '#DC2626',
                    transition: 'width 0.3s',
                  }} />
                </div>
              )}
            </div>

            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Automatic Start on Utility Loss</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
              When armed, the generator starts automatically if the utility feed fails.
            </div>
            <div style={{ maxWidth: 260 }}>
              <ActionButton
                label={autoStartOn ? 'Disarm Auto-start' : 'Arm Auto-start'}
                danger={autoStartOn}
                disabled={readOnly}
                onRun={() => postControl('generator/auto-start', { enabled: !autoStartOn })}
              />
            </div>
          </div>
        );

      // ── Breakers ────────────────────────────────────────────────────────────
      case 'breakers':
        return (
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Breaker Panel</h2>
            {branches.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
                No branch circuit data available
              </div>
            ) : (
              <div className="table-card">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Circuit', 'Phase', 'Load (A)', 'Voltage', 'State', 'Action'].map(h => (
                        <th key={h} style={{
                          padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600,
                          color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
                          background: 'var(--surface)',
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {branches.map((b: WsBranchCircuit) => (
                      <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 500 }}>{b.label}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{b.phase}</td>
                        <td style={{ padding: '8px 12px', fontVariantNumeric: 'tabular-nums' }}>{b.amps.toFixed(1)}</td>
                        <td style={{ padding: '8px 12px', fontVariantNumeric: 'tabular-nums' }}>{b.volts.toFixed(0)} V</td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                            background: b.breaker_on ? 'rgba(16,185,129,0.1)' : 'rgba(220,38,38,0.1)',
                            color: b.breaker_on ? '#10B981' : '#DC2626', textTransform: 'uppercase',
                          }}>
                            {b.breaker_on ? 'ON' : 'TRIPPED'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', minWidth: 90 }}>
                          <BreakerToggle id={b.id} on={b.breaker_on} disabled={readOnly} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Emergency shutdown — two-step arm to avoid an accidental trip */}
            <div style={{
              marginTop: 24, padding: '14px 16px', borderRadius: 8,
              border: '1px solid rgba(220,38,38,0.3)', background: 'rgba(220,38,38,0.04)',
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#DC2626', marginBottom: 4 }}>
                Emergency Power-off
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
                Simulates a full utility loss across the facility.
              </div>
              <div style={{ display: 'flex', gap: 8, maxWidth: 360 }}>
                <button
                  onClick={() => setEmergencyArmed(a => !a)}
                  disabled={readOnly}
                  style={{
                    flex: 1, padding: '12px 16px', borderRadius: 8, fontSize: 14, fontWeight: 500,
                    border: '1px solid var(--border)', background: 'var(--surface)',
                    color: 'var(--text)', cursor: readOnly ? 'not-allowed' : 'pointer',
                    opacity: readOnly ? 0.5 : 1,
                  }}
                >
                  {emergencyArmed ? 'Cancel' : 'Arm'}
                </button>
                {emergencyArmed && (
                  <div style={{ flex: 1 }}>
                    <ActionButton
                      label="Confirm Shutdown"
                      danger
                      disabled={readOnly}
                      onRun={async () => {
                        const ok = await postControl('emergency/shutdown', { confirm: 'SHUTDOWN' });
                        setEmergencyArmed(false);
                        return ok;
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        );
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Controls</h1>
        <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>
          Manual overrides and equipment control — ADMIN only
        </p>
        {readOnly && (
          <div style={{
            padding: '10px 14px', borderRadius: 8, marginTop: 12,
            background: 'rgba(217,119,6,0.06)', border: '1px solid rgba(217,119,6,0.2)',
          }}>
            <span style={{ fontSize: 14, color: '#D97706', fontWeight: 500 }}>
              ⚠ Read-only — sign in as ADMIN to issue control commands
            </span>
          </div>
        )}
      </div>

      {/* Sidebar + content */}
      <div style={{ display: 'flex', gap: 0, minHeight: 500 }}>
        <div style={{ width: 200, borderRight: '1px solid var(--border)', flexShrink: 0 }}>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              style={{
                display: 'block', width: '100%', padding: '10px 16px',
                textAlign: 'left', fontSize: 14, fontWeight: activeSection === s.id ? 600 : 400,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: activeSection === s.id ? 'var(--text)' : 'var(--muted)',
                borderLeft: activeSection === s.id ? '2px solid var(--accent)' : '2px solid transparent',
                marginLeft: -1,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, padding: '0 0 0 28px' }}>
          {renderSection()}
        </div>
      </div>
    </div>
  );
}

// Per-branch breaker trip/reset wired to POST /control/pdu/breaker.
function BreakerToggle({ id, on, disabled }: { id: string; on: boolean; disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  async function handle() {
    if (disabled || busy) return;
    setBusy(true);
    await postControl('pdu/breaker', { branch_id: id, on: !on });
    setBusy(false);
  }
  return (
    <button
      disabled={disabled || busy}
      onClick={handle}
      style={{
        padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
        border: on ? '1px solid rgba(220,38,38,0.3)' : '1px solid rgba(16,185,129,0.3)',
        background: on ? 'rgba(220,38,38,0.06)' : 'rgba(16,185,129,0.06)',
        color: on ? '#DC2626' : '#10B981',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled || busy ? 0.5 : 1,
      }}
    >
      {busy ? '…' : on ? 'Trip' : 'Reset'}
    </button>
  );
}
