'use client';

import type { WsAccessControl } from '@dctwin/types';
import { StatusBadge } from './StatusBadge';

interface Props {
  data: WsAccessControl | undefined;
}

function formatEvent(raw: string | null): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function AccessControlTab({ data }: Props) {
  if (!data) {
    return (
      <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
        Awaiting access control data…
      </div>
    );
  }

  const lockedCount   = data.doors.filter(d => d.locked).length;
  const unlockedCount = data.doors.length - lockedCount;

  return (
    <div>
      {/* Intrusion alert */}
      {data.intrusion_detected && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 16px', borderRadius: 2, marginBottom: 16,
          border: '1px solid #DC2626', background: 'rgba(220,38,38,0.06)',
          fontSize: 13, fontWeight: 600, color: '#DC2626',
        }}>
          <span style={{
            display: 'inline-block', width: 8, height: 8,
            borderRadius: '50%', background: '#DC2626', flexShrink: 0,
          }} />
          INTRUSION DETECTED
        </div>
      )}

      {/* Summary strip */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 16,
        padding: '8px 14px', borderRadius: 2,
        border: '1px solid var(--border)', background: 'var(--surface)',
        marginBottom: 20, fontSize: 13,
      }}>
        <span style={{ color: 'var(--muted)' }}>{data.doors.length} doors total</span>
        <span style={{ color: '#16A34A', fontWeight: 600 }}>{lockedCount} locked</span>
        <span style={{ color: '#D97706', fontWeight: 600 }}>{unlockedCount} unlocked</span>
      </div>

      <div className="table-card">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Door / Location', 'Badge Required', 'Lock State', 'Last Event'].map(h => (
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
          {data.doors.map(d => (
            <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '10px 12px' }}>
                <div style={{ fontWeight: 500, color: 'var(--text)' }}>{d.location}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{d.id}</div>
              </td>
              <td style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: 13 }}>
                {d.badge_required ? 'Yes' : 'No'}
              </td>
              <td style={{ padding: '10px 12px' }}>
                <StatusBadge status={d.locked ? 'LOCKED' : 'UNLOCKED'} />
              </td>
              <td style={{
                padding: '10px 12px', color: 'var(--muted)', fontSize: 12,
                fontFamily: 'ui-monospace, monospace',
              }}>
                {formatEvent(d.last_event)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
