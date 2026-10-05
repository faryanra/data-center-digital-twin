'use client';

import type { WsFacilitySnapshot, WsHallState } from '@dctwin/types';

interface Props {
  snapshot: WsFacilitySnapshot | null;
}

interface HallRow {
  id: string;
  name: string;
  itLoadKw: number;
  avgInletC: number;
  peakInletC: number;
  crahActive: number;
  crahTotal: number;
  rackCount: number;
  status: 'OK' | 'WARNING' | 'CRITICAL';
}

export function HallStatusBar({ snapshot }: Props) {
  if (!snapshot) {
    return (
      <div style={{ marginTop: 16 }}>
        <div style={{
          fontSize: 11, fontWeight: 600, color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
        }}>
          Hall Status
        </div>
        <div style={{ height: 60, background: 'var(--surface)', borderRadius: 2, animation: 'pulse 2s ease infinite' }} />
      </div>
    );
  }

  const halls = snapshot.halls ?? [];
  const racksA = snapshot.racks.filter(r => r.id.startsWith('rack-a'));
  const racksB = snapshot.racks.filter(r => r.id.startsWith('rack-b'));

  function buildRow(
    id: string,
    name: string,
    racks: typeof racksA,
    hallState: WsHallState | undefined,
  ): HallRow {
    const itLoadKw   = hallState?.total_kw    ?? racks.reduce((s, r) => s + r.kw, 0);
    const avgInletC  = hallState?.avg_inlet_c  ?? (racks.length > 0 ? racks.reduce((s, r) => s + r.inlet_c, 0) / racks.length : 0);
    const peakInletC = racks.length > 0 ? Math.max(...racks.map(r => r.inlet_c)) : 0;
    const crahActive = hallState?.crah_online  ?? Math.ceil(snapshot!.cooling.crah_online / 2);
    const crahTotal  = hallState?.crah_total   ?? Math.ceil(snapshot!.cooling.crah_total / 2);
    const rackCount  = hallState?.rack_count   ?? racks.length;

    let status: HallRow['status'] = 'OK';
    if (peakInletC >= 30 || racks.some(r => r.status === 'CRITICAL') || crahActive === 0) {
      status = 'CRITICAL';
    } else if (avgInletC >= 27 || racks.some(r => r.status === 'WARNING') || crahActive < crahTotal) {
      status = 'WARNING';
    }

    return { id, name, itLoadKw, avgInletC, peakInletC, crahActive, crahTotal, rackCount, status };
  }

  const rows: HallRow[] = halls.length > 0
    ? halls.map((h, i) => buildRow(
        h.id,
        h.name,
        i === 0 ? racksA : racksB,
        h,
      ))
    : [
        buildRow('data-hall-a', 'Data Hall A', racksA, undefined),
        buildRow('data-hall-b', 'Data Hall B', racksB, undefined),
      ];

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
      }}>
        Hall Status
      </div>
      <div className="table-card">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Hall', 'IT Load', 'Avg Inlet', 'Peak Inlet', 'CRAH Active', 'Racks', 'Status'].map(h => (
              <th key={h} style={{
                padding: '6px 12px', textAlign: 'left', fontSize: 11,
                fontWeight: 600, color: 'var(--muted)',
                textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(hall => (
            <tr key={hall.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text)' }}>
                {hall.name}
              </td>
              <td style={{
                padding: '10px 12px', color: 'var(--text)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {hall.itLoadKw.toFixed(1)} kW
              </td>
              <td style={{
                padding: '10px 12px', fontVariantNumeric: 'tabular-nums',
                color: hall.avgInletC > 27 ? '#D97706' : 'var(--text)',
              }}>
                {hall.avgInletC.toFixed(1)} °C
              </td>
              <td style={{
                padding: '10px 12px', fontVariantNumeric: 'tabular-nums',
                color: hall.peakInletC > 30 ? '#DC2626' : 'var(--text)',
              }}>
                {hall.peakInletC.toFixed(1)} °C
              </td>
              <td style={{ padding: '10px 12px', color: 'var(--text)' }}>
                {hall.crahActive}/{hall.crahTotal}
              </td>
              <td style={{ padding: '10px 12px', color: 'var(--text)' }}>
                {hall.rackCount}
              </td>
              <td style={{ padding: '10px 12px' }}>
                <span style={{
                  fontSize: 12, fontWeight: 600, padding: '3px 8px', borderRadius: 2,
                  background:
                    hall.status === 'OK'       ? 'rgba(22,163,74,0.1)'  :
                    hall.status === 'WARNING'  ? 'rgba(217,119,6,0.1)'  :
                    'rgba(220,38,38,0.1)',
                  color:
                    hall.status === 'OK'       ? '#16A34A' :
                    hall.status === 'WARNING'  ? '#D97706' : '#DC2626',
                }}>
                  {hall.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
