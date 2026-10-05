'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';
import { useFacilitySocket } from '@/hooks/useFacilitySocket';
import type { AlarmRow } from '@dctwin/types';

// ── Report type definitions ────────────────────────────────────────────────────

const REPORT_TYPES = [
  {
    id: 'alarm_history' as const,
    label: 'Alarm History',
    description: 'All alarms with severity, source, timestamps, and resolution status',
  },
  {
    id: 'energy_summary' as const,
    label: 'Energy Summary',
    description: 'IT load, PUE, cooling load — hourly averages',
  },
  {
    id: 'equipment_status' as const,
    label: 'Equipment Status Snapshot',
    description: 'Current state of all UPS, PDU, CRAH, and rack units',
  },
];

type ReportTypeId = typeof REPORT_TYPES[number]['id'];

// ── Export helpers ─────────────────────────────────────────────────────────────

function exportCSV(data: Record<string, unknown>[], filename: string) {
  if (data.length === 0) return;
  const headers = Object.keys(data[0]).join(',');
  const rows = data.map(r =>
    Object.values(r).map(v =>
      typeof v === 'string' && v.includes(',') ? `"${v}"` : String(v ?? ''),
    ).join(','),
  );
  const csv  = [headers, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `${filename}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function exportExcel(data: Record<string, unknown>[], filename: string) {
  if (data.length === 0) return;
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

// ── Column definitions per report type ────────────────────────────────────────

const COLUMNS: Record<ReportTypeId, string[]> = {
  alarm_history:   ['raised_at', 'severity', 'source', 'message', 'state', 'acked_by'],
  energy_summary:  ['timestamp', 'it_kw', 'cooling_kw', 'pue'],
  equipment_status: ['type', 'id', 'status', 'detail_1', 'detail_2'],
};

// ── SEV color ──────────────────────────────────────────────────────────────────

const SEV_CLR: Record<string, string> = {
  CRITICAL: '#DC2626',
  WARNING:  '#D97706',
  INFO:     '#2563EB',
};

// ── Main component ─────────────────────────────────────────────────────────────

export function ReportsClient() {
  const { snapshot } = useFacilitySocket();

  const [reportType, setReportType] = useState<ReportTypeId>('alarm_history');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const [reportData, setReportData]     = useState<Record<string, unknown>[] | null>(null);
  const [generating, setGenerating]     = useState(false);
  const [influxNote, setInfluxNote]     = useState(false);

  async function generateReport() {
    setGenerating(true);
    setReportData(null);
    setInfluxNote(false);

    try {
      if (reportType === 'alarm_history') {
        const res  = await fetch('/api/proxy/alarms?state=all&limit=500');
        const body = await res.json() as unknown;
        const rows: AlarmRow[] = Array.isArray(body)
          ? (body as AlarmRow[])
          : ((body as { alarms?: AlarmRow[] }).alarms ?? []);
        setReportData(rows.map(a => ({
          raised_at: new Date(a.raised_at * 1000).toISOString(),
          severity:  a.severity,
          source:    a.source,
          message:   a.message,
          state:     a.state,
          acked_by:  a.acked_by ?? '',
        })));
      } else if (reportType === 'energy_summary') {
        const res = await fetch('/api/proxy/facility/history?hours=168', { cache: 'no-store' });
        if (!res.ok) {
          setInfluxNote(true);
          setReportData([]);
        } else {
          const json = await res.json() as {
            points: { ts: number; it_load_kw: number; cooling_power_kw: number; pue: number }[];
          };
          const rows = json.points ?? [];
          if (rows.length === 0) setInfluxNote(true);
          setReportData(rows.map(p => ({
            timestamp:  new Date(p.ts * 1000).toISOString(),
            it_kw:      Math.round(p.it_load_kw * 10) / 10,
            cooling_kw: Math.round(p.cooling_power_kw * 10) / 10,
            pue:        Math.round(p.pue * 100) / 100,
          })));
        }
      } else {
        // equipment_status — snapshot only, no API call
        if (!snapshot) { setReportData([]); return; }
        const rows: Record<string, unknown>[] = [
          ...snapshot.ups.map(u => ({
            type: 'UPS', id: u.id, status: u.mode,
            detail_1: `Battery: ${u.battery_pct.toFixed(0)}%`,
            detail_2: `Load: ${u.load_pct.toFixed(0)}%`,
          })),
          ...snapshot.pdus.map(p => ({
            type: 'PDU', id: p.id, status: p.load_pct > 90 ? 'OVERLOAD' : 'NORMAL',
            detail_1: `Load: ${p.load_kw.toFixed(1)} kW`,
            detail_2: `${p.load_pct.toFixed(0)}%`,
          })),
          ...snapshot.racks.map(r => ({
            type: 'Rack', id: r.id, status: r.status,
            detail_1: `${r.kw.toFixed(1)} kW`,
            detail_2: `Inlet: ${r.inlet_c.toFixed(1)}°C`,
          })),
        ];
        setReportData(rows);
      }
    } catch {
      setReportData([]);
    } finally {
      setGenerating(false);
    }
  }

  const cols    = COLUMNS[reportType];
  const fileTag = `${reportType}-${new Date().toISOString().split('T')[0]}`;

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Reports</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
          DC-NORTH-01 · generate and export facility reports
        </p>
      </div>

      {/* ── Section 1: Report type selector ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        {REPORT_TYPES.map(r => (
          <div
            key={r.id}
            onClick={() => { setReportType(r.id); setReportData(null); setInfluxNote(false); }}
            style={{
              padding: '14px 16px', borderRadius: 4, cursor: 'pointer',
              border: `2px solid ${reportType === r.id ? 'var(--accent)' : 'var(--border)'}`,
              background: reportType === r.id ? 'rgba(37,99,235,0.05)' : 'var(--surface)',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
              {r.label}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>{r.description}</div>
          </div>
        ))}
      </div>

      {/* ── Section 2: Time range (alarm + energy only) ── */}
      {reportType !== 'equipment_status' && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 14, color: 'var(--muted)' }}>From</label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            style={{
              padding: '7px 10px', borderRadius: 2, border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text)', fontSize: 14,
            }}
          />
          <label style={{ fontSize: 14, color: 'var(--muted)' }}>To</label>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            style={{
              padding: '7px 10px', borderRadius: 2, border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text)', fontSize: 14,
            }}
          />
          <button
            onClick={() => void generateReport()}
            disabled={generating}
            style={{
              padding: '7px 16px', borderRadius: 2, background: 'var(--accent)',
              color: '#fff', border: 'none', fontSize: 14, fontWeight: 500,
              cursor: generating ? 'not-allowed' : 'pointer',
              opacity: generating ? 0.7 : 1,
            }}
          >
            {generating ? 'Generating…' : 'Generate'}
          </button>
        </div>
      )}

      {/* Equipment status — no date range, just a generate button */}
      {reportType === 'equipment_status' && (
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={() => void generateReport()}
            disabled={generating}
            style={{
              padding: '7px 16px', borderRadius: 2, background: 'var(--accent)',
              color: '#fff', border: 'none', fontSize: 14, fontWeight: 500,
              cursor: generating ? 'not-allowed' : 'pointer',
              opacity: generating ? 0.7 : 1,
            }}
          >
            {generating ? 'Generating…' : 'Generate Snapshot'}
          </button>
        </div>
      )}

      {/* ── InfluxDB note ── */}
      {influxNote && (
        <div style={{
          padding: '10px 14px', borderRadius: 4, marginBottom: 16,
          background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)',
          fontSize: 13, color: '#D97706',
        }}>
          Requires InfluxDB. Historical energy data unavailable — configure InfluxDB to enable this report.
        </div>
      )}

      {/* ── Section 3: Results ── */}
      {reportData !== null && (
        <div>
          {/* Row count + export buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              Showing <strong style={{ color: 'var(--text)' }}>{reportData.length}</strong> record{reportData.length !== 1 ? 's' : ''}
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button
                onClick={() => exportCSV(reportData, fileTag)}
                disabled={reportData.length === 0}
                style={{
                  padding: '6px 14px', borderRadius: 2, fontSize: 13, fontWeight: 500,
                  border: '1px solid var(--border)', background: 'transparent',
                  color: 'var(--text)', cursor: reportData.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: reportData.length === 0 ? 0.5 : 1,
                }}
              >
                Download CSV
              </button>
              <button
                onClick={() => exportExcel(reportData, fileTag)}
                disabled={reportData.length === 0}
                style={{
                  padding: '6px 14px', borderRadius: 2, fontSize: 13, fontWeight: 500,
                  border: '1px solid #16a34a', background: 'rgba(22,163,74,0.06)',
                  color: '#16a34a', cursor: reportData.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: reportData.length === 0 ? 0.5 : 1,
                }}
              >
                Download Excel
              </button>
            </div>
          </div>

          {/* Data table */}
          {reportData.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
              No records found for the selected criteria.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', borderRadius: 4, border: '1px solid var(--border)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                    {cols.map(col => (
                      <th
                        key={col}
                        style={{
                          padding: '9px 14px', textAlign: 'left',
                          fontSize: 12, fontWeight: 600, color: 'var(--muted)',
                          textTransform: 'uppercase', letterSpacing: '0.04em',
                        }}
                      >
                        {col.replace(/_/g, ' ')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportData.map((row, i) => (
                    <tr
                      key={i}
                      style={{
                        borderBottom: i < reportData.length - 1 ? '1px solid var(--border)' : 'none',
                        background: i % 2 === 0 ? 'var(--surface)' : 'var(--bg)',
                      }}
                    >
                      {cols.map(col => {
                        const val = row[col];
                        const str = String(val ?? '');
                        // Severity badge
                        if (col === 'severity' && typeof val === 'string' && SEV_CLR[val]) {
                          return (
                            <td key={col} style={{ padding: '9px 14px' }}>
                              <span style={{
                                fontSize: 11, fontWeight: 700, color: SEV_CLR[val],
                                background: `${SEV_CLR[val]}18`,
                                padding: '2px 7px', borderRadius: 10,
                              }}>
                                {str}
                              </span>
                            </td>
                          );
                        }
                        // Status badge
                        if (col === 'status' || col === 'state') {
                          const isOk = str === 'NORMAL' || str === 'ONLINE' || str === 'ACKNOWLEDGED';
                          const isWarn = str === 'WARNING';
                          const isCrit = str === 'CRITICAL' || str === 'ACTIVE' || str === 'FAULT' || str === 'OVERLOAD';
                          const clr = isCrit ? '#DC2626' : isWarn ? '#D97706' : isOk ? '#16a34a' : 'var(--muted)';
                          return (
                            <td key={col} style={{ padding: '9px 14px' }}>
                              <span style={{
                                fontSize: 11, fontWeight: 600, color: clr,
                                background: `${clr}18`,
                                padding: '2px 7px', borderRadius: 10,
                              }}>
                                {str}
                              </span>
                            </td>
                          );
                        }
                        return (
                          <td key={col} style={{ padding: '9px 14px', color: 'var(--text)', fontFamily: col === 'timestamp' || col === 'raised_at' ? 'ui-monospace, monospace' : undefined, fontSize: col === 'timestamp' || col === 'raised_at' ? 12 : 13 }}>
                            {str}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
