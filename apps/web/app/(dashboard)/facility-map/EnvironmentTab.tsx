'use client';

import type { WsEnvironment } from '@dctwin/types';
import { StatusBadge } from './StatusBadge';

interface Props {
  data: WsEnvironment | undefined;
  setpointC?: number;
}

// Magnus approximation for dew point (°C)
function dewPoint(tempC: number, humidityPct: number): number {
  return tempC - (100 - humidityPct) / 5;
}

export function EnvironmentTab({ data, setpointC = 22 }: Props) {
  if (!data) {
    return (
      <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
        Awaiting environmental data…
      </div>
    );
  }

  return (
    <div>
      {/* Setpoint strip */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 12,
        padding: '8px 14px', borderRadius: 2,
        border: '1px solid var(--border)', background: 'var(--surface)',
        marginBottom: 20, fontSize: 13,
      }}>
        <span style={{ color: 'var(--muted)' }}>CRAH Setpoint</span>
        <span style={{ fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
          {setpointC.toFixed(1)} °C
        </span>
      </div>

      <div className="table-card">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Zone', 'Temperature', 'Humidity', 'Dew Point', 'Airflow', 'Status'].map(h => (
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
          {data.zones.map(z => {
            const dp = dewPoint(z.temp_c, z.humidity_pct);
            return (
              <tr key={z.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 500, color: 'var(--text)' }}>
                  {z.location}
                </td>
                <td style={{
                  padding: '10px 12px', fontVariantNumeric: 'tabular-nums',
                  color: z.temp_c > 30 ? '#DC2626' : z.temp_c > 27 ? '#D97706' : 'var(--text)',
                }}>
                  {z.temp_c.toFixed(1)} °C
                </td>
                <td style={{
                  padding: '10px 12px', fontVariantNumeric: 'tabular-nums',
                  color: z.humidity_pct > 70 ? '#D97706' : 'var(--text)',
                }}>
                  {z.humidity_pct.toFixed(0)}%
                </td>
                <td style={{ padding: '10px 12px', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {dp.toFixed(1)} °C
                </td>
                <td style={{ padding: '10px 12px', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {z.airflow_mps.toFixed(2)} m/s
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <StatusBadge status={z.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
