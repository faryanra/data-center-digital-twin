'use client';

import { useEffect, useRef, useState } from 'react';
import { useFacilitySocket } from '@/hooks/useFacilitySocket';
import { useAuth } from '@/lib/auth/context';

// ── Sections ──────────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'thresholds',    label: 'Alert Thresholds' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'simulation',    label: 'Simulation Config' },
  { id: 'account',       label: 'Account' },
] as const;

type SectionId = typeof SECTIONS[number]['id'];

// ── Thresholds ────────────────────────────────────────────────────────────────

const DEFAULT_THRESHOLDS = {
  rackInletWarn:    28,
  rackInletCrit:    32,
  pueWarn:           1.8,
  pueCrit:           2.2,
  upsCapacityWarn:  80,
  upsCapacityCrit:  90,
  batteryWarn:      30,
  batteryCrit:      10,
  humidityWarn:     65,
  humidityCrit:     75,
};

type Thresholds = typeof DEFAULT_THRESHOLDS;
type ThresholdKey = keyof Thresholds;

interface ThresholdRow {
  key: string;
  label: string;
  warnKey: ThresholdKey;
  critKey: ThresholdKey;
  unit: string;
  step: number;
}

const THRESHOLD_ROWS: ThresholdRow[] = [
  { key: 'rackInlet',   label: 'Rack Inlet Temp', warnKey: 'rackInletWarn',   critKey: 'rackInletCrit',   unit: '°C',   step: 0.5 },
  { key: 'pue',         label: 'PUE',             warnKey: 'pueWarn',         critKey: 'pueCrit',         unit: 'ratio',step: 0.1 },
  { key: 'upsCapacity', label: 'UPS Load',        warnKey: 'upsCapacityWarn', critKey: 'upsCapacityCrit', unit: '%',    step: 1 },
  { key: 'battery',     label: 'Battery Level',   warnKey: 'batteryWarn',     critKey: 'batteryCrit',     unit: '%',    step: 1 },
  { key: 'humidity',    label: 'Humidity',        warnKey: 'humidityWarn',    critKey: 'humidityCrit',    unit: '%',    step: 1 },
];

// ── Notifications ─────────────────────────────────────────────────────────────

interface NotificationPrefs {
  emailEnabled:   boolean;
  emailAddress:   string;
  criticalAlarms: boolean;
  warningAlarms:  boolean;
  systemEvents:   boolean;
  dailySummary:   boolean;
}

const DEFAULT_NOTIFICATIONS: NotificationPrefs = {
  emailEnabled:   false,
  emailAddress:   '',
  criticalAlarms: true,
  warningAlarms:  false,
  systemEvents:   false,
  dailySummary:   false,
};

// ── ToggleRow sub-component ───────────────────────────────────────────────────

function ToggleRow({ label, desc, value, onChange }: {
  label: string;
  desc: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      padding: '14px 0', borderBottom: '1px solid var(--border)',
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{label}</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{desc}</div>
      </div>
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        style={{
          width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
          background: value ? 'var(--accent)' : 'var(--border)',
          position: 'relative', flexShrink: 0, marginLeft: 16, transition: 'background 0.2s',
        }}
      >
        <span style={{
          position: 'absolute', top: 3, left: value ? 19 : 3,
          width: 16, height: 16, borderRadius: '50%', background: 'white',
          transition: 'left 0.2s',
          display: 'block',
        }} />
      </button>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeLocalStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) };
  } catch {
    return fallback;
  }
}

function safeLocalStorageSet(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
}

const INPUT_STYLE = {
  width: '100%', padding: '8px 10px', borderRadius: 2,
  border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' as const,
};

// ── Main component ─────────────────────────────────────────────────────────────

export function SettingsClient() {
  const { connState } = useFacilitySocket();
  const { user } = useAuth();

  const [section, setSection]         = useState<SectionId>('thresholds');
  const [thresholds, setThresholds]   = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [notifPrefs, setNotifPrefs]   = useState<NotificationPrefs>(DEFAULT_NOTIFICATIONS);
  const [showSavedToast, setToast]    = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load persisted state on mount
  useEffect(() => {
    setThresholds(safeLocalStorage('dc-thresholds', DEFAULT_THRESHOLDS));
    setNotifPrefs(safeLocalStorage('dc-notifications', DEFAULT_NOTIFICATIONS));
  }, []);

  function flashToast() {
    setToast(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(false), 2000);
  }

  function setThreshold(key: ThresholdKey, value: number) {
    setThresholds(prev => {
      const next = { ...prev, [key]: value };
      safeLocalStorageSet('dc-thresholds', next);
      return next;
    });
    flashToast();
  }

  function setNotifPref<K extends keyof NotificationPrefs>(key: K, value: NotificationPrefs[K]) {
    setNotifPrefs(prev => {
      const next = { ...prev, [key]: value };
      safeLocalStorageSet('dc-notifications', next);
      return next;
    });
    flashToast();
  }

  async function handleSignOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.replace('/login');
  }

  // ── Section renderers ──────────────────────────────────────────────────────

  function renderThresholds() {
    return (
      <div>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Alert Thresholds</h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            Changes are saved automatically and persist across sessions.
          </p>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Metric', 'Warning', 'Critical', 'Unit'].map(h => (
                <th key={h} style={{
                  padding: '8px 12px', textAlign: 'left', fontSize: 11,
                  fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {THRESHOLD_ROWS.map(row => (
              <tr key={row.key} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 12px', fontSize: 14, color: 'var(--text)' }}>
                  {row.label}
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <input
                    type="number"
                    value={thresholds[row.warnKey]}
                    step={row.step}
                    onChange={e => setThreshold(row.warnKey, +e.target.value)}
                    style={{
                      width: 80, padding: '6px 8px', border: '1px solid var(--border)',
                      borderRadius: 2, background: 'var(--surface)', color: '#D97706',
                      fontWeight: 600, fontSize: 14, textAlign: 'center',
                    }}
                  />
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <input
                    type="number"
                    value={thresholds[row.critKey]}
                    step={row.step}
                    onChange={e => setThreshold(row.critKey, +e.target.value)}
                    style={{
                      width: 80, padding: '6px 8px', border: '1px solid var(--border)',
                      borderRadius: 2, background: 'var(--surface)', color: '#DC2626',
                      fontWeight: 600, fontSize: 14, textAlign: 'center',
                    }}
                  />
                </td>
                <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--muted)' }}>
                  {row.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderNotifications() {
    return (
      <div>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Notifications</h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            Configure which events trigger alerts.
          </p>
        </div>

        <ToggleRow
          label="Email Notifications"
          desc="Send alerts to an email address"
          value={notifPrefs.emailEnabled}
          onChange={v => setNotifPref('emailEnabled', v)}
        />

        {notifPrefs.emailEnabled && (
          <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <label style={{ fontSize: 13, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
              Email Address
            </label>
            <input
              type="email"
              value={notifPrefs.emailAddress}
              onChange={e => setNotifPref('emailAddress', e.target.value)}
              placeholder="ops-team@company.com"
              style={INPUT_STYLE}
            />
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              Requires SMTP configuration in backend settings.
            </div>
          </div>
        )}

        <ToggleRow
          label="Critical Alarms"
          desc="Notify on CRITICAL severity alarms (rack overtemp, UPS fault)"
          value={notifPrefs.criticalAlarms}
          onChange={v => setNotifPref('criticalAlarms', v)}
        />
        <ToggleRow
          label="Warning Alarms"
          desc="Notify on WARNING severity alarms"
          value={notifPrefs.warningAlarms}
          onChange={v => setNotifPref('warningAlarms', v)}
        />
        <ToggleRow
          label="System Events"
          desc="UPS mode changes, generator starts, CRAH trips"
          value={notifPrefs.systemEvents}
          onChange={v => setNotifPref('systemEvents', v)}
        />
        <ToggleRow
          label="Daily Summary"
          desc="Daily report of facility status and energy metrics"
          value={notifPrefs.dailySummary}
          onChange={v => setNotifPref('dailySummary', v)}
        />
      </div>
    );
  }

  function renderSimulation() {
    const INFO_ROWS = [
      ['UPS Capacity',     '800 kVA'],
      ['Generator Capacity', '1000 kW'],
      ['CRAH Units',       '4'],
      ['Target PUE',       '1.45'],
      ['Simulation Tick',  '5 s'],
      ['IT Load Range',    '180–280 kW'],
    ];
    return (
      <div>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Simulation Config</h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            Current hardware and simulation parameters.
          </p>
        </div>

        <div style={{
          border: '1px solid var(--border)', borderRadius: 4,
          background: 'var(--surface)', marginBottom: 16,
        }}>
          {INFO_ROWS.map(([label, value], i) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '11px 16px',
              borderBottom: i < INFO_ROWS.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <span style={{ fontSize: 14, color: 'var(--muted)' }}>{label}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                {value}
              </span>
            </div>
          ))}
        </div>

        <div style={{
          padding: '12px 16px', borderRadius: 4,
          background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)',
          fontSize: 13, color: 'var(--muted)',
        }}>
          Simulation parameters are configured in{' '}
          <code style={{ fontSize: 12, color: 'var(--text)', background: 'rgba(255,255,255,0.04)', padding: '1px 5px', borderRadius: 2 }}>
            simulation/electrical/config.py
          </code>
          . Edit that file to change hardware parameters.
        </div>
      </div>
    );
  }

  function renderAccount() {
    const connColor =
      connState === 'open'       ? '#16A34A' :
      connState === 'connecting' ? '#D97706' : '#DC2626';
    const connLabel =
      connState === 'open'       ? 'Connected' :
      connState === 'connecting' ? 'Connecting…' : 'Disconnected';

    return (
      <div>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Account</h2>
        </div>

        {/* User info */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', marginBottom: 16 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Name</div>
            <div style={{ fontSize: 14, color: 'var(--text)' }}>{user?.name ?? '—'}</div>
          </div>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Email</div>
            <div style={{ fontSize: 14, color: 'var(--text)' }}>{user?.email ?? '—'}</div>
          </div>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Role</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, color: 'var(--text)' }}>{user?.role ?? '—'}</span>
              {user && (
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 2,
                  background: user.role === 'ADMIN' ? 'rgba(37,99,235,0.1)' : 'rgba(107,114,128,0.1)',
                  color: user.role === 'ADMIN' ? '#2563EB' : '#6B7280',
                }}>
                  {user.role}
                </span>
              )}
            </div>
          </div>
          <div style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Session</div>
            <button
              onClick={handleSignOut}
              style={{
                padding: '8px 16px', borderRadius: 2, border: '1px solid rgba(220,38,38,0.4)',
                background: 'rgba(220,38,38,0.05)', color: '#DC2626', fontSize: 14,
                fontWeight: 500, cursor: 'pointer',
              }}
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* WebSocket diagnostic */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              WebSocket
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px' }}>
            <span style={{ fontSize: 14, color: 'var(--muted)' }}>Status</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, color: connColor }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: connColor }} />
              {connLabel}
            </span>
          </div>
        </div>
      </div>
    );
  }

  function renderSection() {
    if (section === 'thresholds')    return renderThresholds();
    if (section === 'notifications') return renderNotifications();
    if (section === 'simulation')    return renderSimulation();
    return renderAccount();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Settings</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>Platform configuration — ADMIN only</p>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'flex', gap: 0, minHeight: 500 }}>
        {/* Sidebar */}
        <div style={{ width: 200, borderRight: '1px solid var(--border)', flexShrink: 0 }}>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 16px', fontSize: 14, border: 'none', cursor: 'pointer',
                fontWeight: section === s.id ? 600 : 400,
                background: section === s.id ? 'var(--surface)' : 'transparent',
                color: section === s.id ? 'var(--accent)' : 'var(--text)',
                borderLeft: section === s.id ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: '0 0 0 28px' }}>
          {renderSection()}
        </div>
      </div>

      {/* Auto-saved toast */}
      <div style={{
        position: 'fixed', bottom: 24, right: 24, padding: '8px 16px',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 4, fontSize: 13, color: 'var(--text)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        opacity: showSavedToast ? 1 : 0, transition: 'opacity 0.3s',
        pointerEvents: 'none',
      }}>
        ✓ Saved
      </div>
    </div>
  );
}
