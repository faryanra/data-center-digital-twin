'use client';

import { useEffect, useState, useCallback } from 'react';

type RegisterEntry = {
  slave_id: number;
  holding_registers?: number[];
  error?: string;
};

type ModbusRegisters = Record<string, RegisterEntry>;

const DEVICE_LABELS: Record<string, string> = {
  'ups-01':        'UPS-01',
  'pdu-a1':        'PDU-A1',
  'crah-a':        'CRAH-A',
  'generator-01':  'Generator',
};

const API_BASE = '/api/proxy';

export function ModbusPanel() {
  const [data, setData] = useState<ModbusRegisters | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<string>('—');

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/modbus/registers`);
      if (res.ok) {
        setData(await res.json());
        setLastFetched(new Date().toLocaleTimeString('en-GB'));
      }
    } catch {
      // offline — leave stale data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  return (
    <div className="w-64 shrink-0 rounded border border-[var(--border)] bg-[var(--surface)] p-4"
      style={{ alignSelf: 'flex-start' }}>

      {/* header */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--text)]">Modbus TCP</span>
          <span className="rounded px-1.5 py-0.5 font-mono text-[12px] text-[var(--muted)]">:5020</span>
          <span style={{
            display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
            background: data ? '#10B981' : '#6B7280',
            boxShadow: data ? '0 0 5px #10B981' : undefined,
          }} />
        </div>
        <button
          onClick={fetch_}
          disabled={loading}
          className="text-[12px] text-[var(--muted)] transition-colors hover:text-[var(--accent)] disabled:opacity-50"
        >
          {loading ? '…' : '↺'}
        </button>
      </div>

      {/* table */}
      {data ? (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="pb-1 text-left text-[12px] font-semibold text-[var(--muted)]">Device</th>
              <th className="pb-1 text-left text-[12px] font-semibold text-[var(--muted)]">Sl</th>
              <th className="pb-1 text-left text-[12px] font-semibold text-[var(--muted)]">R[0..3]</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(data).map(([key, entry]) => (
              <tr key={key} className="border-b border-[var(--border)]/40 last:border-0">
                <td className="py-1.5 text-[var(--text)]">{DEVICE_LABELS[key] ?? key}</td>
                <td className="py-1.5 text-[var(--muted)]">{entry.slave_id}</td>
                <td className="py-1.5 font-mono text-[var(--muted)]">
                  {entry.error
                    ? <span className="text-[#EF4444]">err</span>
                    : (entry.holding_registers ?? []).slice(0, 4).join(' ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-center text-[12px] text-[var(--muted)]">
          {loading ? 'Loading…' : 'No data'}
        </p>
      )}

      <p className="mt-2 text-center text-[12px] text-[var(--muted)]">
        Updated {lastFetched}
      </p>
    </div>
  );
}
