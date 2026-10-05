'use client';

import type { WsFireSafety } from '@dctwin/types';
import { StatusBadge } from './StatusBadge';

interface Props {
  data: WsFireSafety | undefined;
}

export function FireSafetyTab({ data }: Props) {
  if (!data) {
    return (
      <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
        Awaiting fire safety data…
      </div>
    );
  }

  const armedColor = data.system_armed ? '#16A34A' : '#DC2626';

  return (
    <div>
      {/* System status strip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '10px 16px', borderRadius: 2,
        border: '1px solid var(--border)', background: 'var(--surface)',
        marginBottom: 20, fontSize: 13,
      }}>
        <span style={{
          display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
          background: armedColor, flexShrink: 0,
        }} />
        <span style={{ fontWeight: 600, color: 'var(--text)' }}>
          Fire Suppression — {data.system_armed ? 'ARMED' : 'DISARMED'}
        </span>
        {data.last_alarm_zone && (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#DC2626', fontWeight: 500 }}>
            Last alarm: {data.last_alarm_zone}
          </span>
        )}
      </div>

      <div className="table-card">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Zone', 'Smoke', 'Heat', 'Suppressant %', 'Status'].map(h => (
              <th key={h} style={{
                padding: '8px 12px', textAlign: 'left', fontSize: 11,
                fontWeight: 600, color: 'var(--muted)',
                textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.zones.map(z => (
            <tr key={z.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '10px 12px', fontWeight: 500, color: 'var(--text)' }}>
                {z.name}
              </td>
              <td style={{
                padding: '10px 12px', fontVariantNumeric: 'tabular-nums',
                color: z.smoke_ppm > 50 ? '#DC2626' : z.smoke_ppm > 20 ? '#D97706' : 'var(--text)',
              }}>
                {z.smoke_ppm.toFixed(1)} ppm
              </td>
              <td style={{
                padding: '10px 12px', fontVariantNumeric: 'tabular-nums',
                color: z.heat_c > 60 ? '#DC2626' : z.heat_c > 45 ? '#D97706' : 'var(--text)',
              }}>
                {z.heat_c.toFixed(1)} °C
              </td>
              <td style={{
                padding: '10px 12px', fontVariantNumeric: 'tabular-nums',
                color: z.suppression_agent_pct < 20 ? '#D97706' : 'var(--text)',
              }}>
                {z.suppression_agent_pct.toFixed(0)}%
              </td>
              <td style={{ padding: '10px 12px' }}>
                <StatusBadge status={z.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
