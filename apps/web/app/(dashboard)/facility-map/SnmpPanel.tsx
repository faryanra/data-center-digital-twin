'use client';

import { useEffect, useState, useCallback } from 'react';

type SnmpDevice = {
  id: string;
  host: string;
  type: 'ups' | 'pdu' | string;
  values: Record<string, number | null>;
  error: string | null;
};

const KEY_LABELS: Record<string, string> = {
  input_voltage:     'Input V',
  output_voltage:    'Output V',
  output_load_pct:   'Load %',
  battery_charge:    'Battery %',
  battery_status:    'Batt Status',
  runtime_remaining: 'Runtime min',
  input_freq:        'Freq',
  total_load_w:      'Total W',
  phase_a_load:      'Phase A',
};

const API_BASE = '/api/proxy';

export function SnmpPanel() {
  const [devices, setDevices] = useState<SnmpDevice[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState('—');

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/snmp/status`);
      if (res.ok) {
        setDevices(await res.json());
        setLastFetched(new Date().toLocaleTimeString('en-GB'));
      }
    } catch {
      // offline — leave stale data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, 30_000);
    return () => clearInterval(id);
  }, [fetch_]);

  const isEmpty = devices !== null && devices.length === 0;

  if (isEmpty) return null;

  return (
    <div
      className="w-64 shrink-0 rounded border border-[var(--border)] bg-[var(--surface)]"
      style={{ alignSelf: 'flex-start' }}
    >
      {/* Header — always visible */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--text)]">Physical Hardware</span>
          <span
            style={{
              display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
              background: isEmpty ? '#6B7280' : devices && devices.some(d => d.error) ? '#F59E0B' : '#10B981',
              boxShadow: !isEmpty && devices && devices.every(d => !d.error) ? '0 0 5px #10B981' : undefined,
            }}
          />
        </div>
        <span className="text-xs text-[var(--muted)]">{open ? '▲' : '▼'}</span>
      </button>

      {/* Body */}
      {open && (
        <div className="border-t border-[var(--border)] px-4 pb-4 pt-3 space-y-3">
          {isEmpty ? (
            <div className="space-y-2 text-xs text-[var(--muted)]">
              <p>No SNMP devices configured.</p>
              <p className="rounded border border-[var(--border)] bg-[var(--surface-2)] p-2 font-mono text-[12px] leading-relaxed">
                Add SNMP_DEVICES_JSON to .env to connect real hardware.
              </p>
            </div>
          ) : devices === null ? (
            <p className="text-center text-[12px] text-[var(--muted)]">
              {loading ? 'Loading…' : 'No data'}
            </p>
          ) : (
            devices.map((dev) => (
              <div
                key={dev.id}
                className="rounded-lg border border-[var(--border)] p-3 space-y-2"
                style={{ borderColor: dev.error ? '#F59E0B55' : undefined }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-[var(--text)]">{dev.id}</p>
                    <p className="text-[12px] text-[var(--muted)]">{dev.host} · {dev.type.toUpperCase()}</p>
                  </div>
                  {dev.error ? (
                    <span className="rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ background: '#F59E0B22', color: '#F59E0B' }}>
                      ERR
                    </span>
                  ) : (
                    <span className="rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ background: '#10B98122', color: '#10B981' }}>
                      OK
                    </span>
                  )}
                </div>

                {dev.error ? (
                  <p className="text-[12px] text-[#F59E0B] break-words">{dev.error}</p>
                ) : Object.keys(dev.values).length > 0 ? (
                  <table className="w-full text-[12px]">
                    <tbody>
                      {Object.entries(dev.values).map(([k, v]) => (
                        <tr key={k}>
                          <td className="py-0.5 text-[var(--muted)]">{KEY_LABELS[k] ?? k}</td>
                          <td className="py-0.5 text-right font-mono text-[var(--text)]">
                            {v !== null ? v : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-[12px] text-[var(--muted)]">Awaiting first poll…</p>
                )}
              </div>
            ))
          )}

          <div className="flex items-center justify-between">
            <p className="text-[12px] text-[var(--muted)]">SNMP · Updated {lastFetched}</p>
            <button
              onClick={fetch_}
              disabled={loading}
              className="text-[12px] text-[var(--muted)] transition-colors hover:text-[var(--accent)] disabled:opacity-50"
            >
              {loading ? '…' : '↺'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
