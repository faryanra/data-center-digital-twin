'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import { useFacilitySocket, getSnapshotCache } from '@/hooks/useFacilitySocket';
// NOTE: getSnapshotCache() seeds the trend chart from cached snapshots so a
// full page reload shows history immediately instead of an empty chart.
import type { AlarmRow, WsHallState } from '@dctwin/types';

// ── helpers ────────────────────────────────────────────────────────────────────

function timeAgo(tsMs: number): string {
  const s = Math.floor((Date.now() - tsMs) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── KpiSparkline ───────────────────────────────────────────────────────────────

function KpiSparkline({ data, color = 'var(--accent)' }: { data: number[]; color?: string }) {
  if (data.length < 2) return <div style={{ height: 36 }} />;
  const min = Math.min(...data), max = Math.max(...data), range = (max - min) || 0.1;
  const h = 36, w = 90;
  const pts = data.map((v, i, a) => {
    const x = (i / (a.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const fill = `0,${h} ${pts} ${w},${h}`;
  const gradId = `kspk${color.replace(/[^a-z0-9]/gi, 'x').slice(0, 12)}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={fill} fill={`url(#${gradId})`} />
      <polyline points={pts} fill="none" stroke={color}
        strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── trend buf type ─────────────────────────────────────────────────────────────

interface TrendPoint { t: string; itLoad: number; total: number; pue: number }

// ── Hall status helper ─────────────────────────────────────────────────────────

function deriveHallStatus(hall: WsHallState): string {
  if (hall.avg_inlet_c > 30) return 'WARN';
  return 'OK';
}

// ── Main component ─────────────────────────────────────────────────────────────

export function DashboardClient() {
  const { snapshot, connState } = useFacilitySocket();
  // Start empty (matches SSR) then seed from cache on mount → no hydration mismatch,
  // but history is restored instantly on reload.
  const [trendBuf, setTrendBuf] = useState<TrendPoint[]>([]);
  const [alarms, setAlarms] = useState<AlarmRow[]>([]);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const prevAlarmCount = useRef(0);

  useEffect(() => {
    const cached = getSnapshotCache();
    if (cached.length === 0) return;
    setTrendBuf(cached.map(s => ({
      t: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      itLoad: s.it_load_kw ?? 0,
      total:  s.total_power_kw ?? 0,
      pue:    s.pue ?? 1,
    })).slice(-30));
  }, []);

  const fetchAlarms = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/alarms?state=active&limit=20', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json() as unknown;
      const rows = Array.isArray(data)
        ? (data as AlarmRow[])
        : ((data as { alarms?: AlarmRow[] }).alarms ?? []);
      setAlarms(rows);
    } catch { /* offline */ }
  }, []);

  useEffect(() => {
    void fetchAlarms();
    const timer = setInterval(() => void fetchAlarms(), 15_000);
    return () => clearInterval(timer);
  }, [fetchAlarms]);

  useEffect(() => {
    if (!snapshot) return;
    const label = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    setTrendBuf(p => [...p.slice(-29), {
      t: label,
      itLoad: snapshot.it_load_kw ?? 0,
      total: snapshot.total_power_kw ?? 0,
      pue: snapshot.pue ?? 1,
    }]);
    setLastUpdate(Date.now());
    // Live alarm count changed → refresh the detail list so rows match the KPI.
    if (snapshot.alarms.active_count !== prevAlarmCount.current) {
      prevAlarmCount.current = snapshot.alarms.active_count;
      void fetchAlarms();
    }
  }, [snapshot, fetchAlarms]);

  const connected = connState === 'open';
  const itLoad = snapshot?.it_load_kw ?? 0;
  const pue = snapshot?.pue ?? 1;
  const pueColor = pue < 1.4 ? '#16A34A' : pue < 1.8 ? '#D97706' : '#DC2626';
  // Authoritative live count from the WebSocket snapshot — the REST list is
  // capped and polled, so it must not drive the headline number.
  const alarmCount = snapshot?.alarms?.active_count ?? alarms.length;
  const alarmColor = alarmCount === 0 ? '#16A34A' : alarmCount < 3 ? '#D97706' : '#DC2626';

  async function ackAlarm(id: string) {
    await fetch(`/api/proxy/alarms/${id}/acknowledge`, { method: 'POST' }).catch(() => {});
    void fetchAlarms();
  }

  return (
    <div className="page-content">

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500, marginBottom: 4 }}>
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
            DC-NORTH-01 Digital Twin
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {connected && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
              borderRadius: 8, background: 'rgba(22,163,74,0.08)',
              border: '1px solid rgba(22,163,74,0.2)',
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%', background: '#16A34A',
                animation: 'skeleton-pulse 2s infinite', display: 'inline-block',
              }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#16A34A' }}>LIVE</span>
            </div>
          )}
          {lastUpdate && (
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              Updated {timeAgo(lastUpdate)}
            </span>
          )}
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="grid-4">

        {/* IT Load */}
        <div className="kpi-card">
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>IT Load</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--text)', lineHeight: 1, marginBottom: 4 }}>
                {itLoad.toFixed(1)}
                <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--muted)', marginLeft: 4 }}>kW</span>
              </div>
              {trendBuf.length > 5 && (() => {
                const prev = trendBuf[trendBuf.length - 6].itLoad;
                const pct = prev ? ((itLoad - prev) / prev * 100) : 0;
                return (
                  <span className={pct >= 0 ? 'trend-up' : 'trend-down'}>
                    {pct >= 0 ? '↑' : '↓'} {Math.abs(pct).toFixed(1)}%
                  </span>
                );
              })()}
            </div>
            <KpiSparkline data={trendBuf.map(b => b.itLoad)} color="var(--accent)" />
          </div>
        </div>

        {/* Total Facility Power */}
        <div className="kpi-card">
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>Total Power</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--text)', lineHeight: 1, marginBottom: 4 }}>
                {(snapshot?.total_power_kw ?? 0).toFixed(1)}
                <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--muted)', marginLeft: 4 }}>kW</span>
              </div>
              {trendBuf.length > 5 && (() => {
                const curr = snapshot?.total_power_kw ?? 0;
                const prev = trendBuf[trendBuf.length - 6].total;
                const pct = prev ? ((curr - prev) / prev * 100) : 0;
                return (
                  <span className={pct >= 0 ? 'trend-up' : 'trend-down'}>
                    {pct >= 0 ? '↑' : '↓'} {Math.abs(pct).toFixed(1)}%
                  </span>
                );
              })()}
            </div>
            <KpiSparkline data={trendBuf.map(b => b.total)} color="#8B5CF6" />
          </div>
        </div>

        {/* PUE */}
        <div className="kpi-card">
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>PUE</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 30, fontWeight: 800, color: pueColor, lineHeight: 1, marginBottom: 4 }}>
                {pue.toFixed(2)}
              </div>
              <span style={{ fontSize: 12, color: pueColor, fontWeight: 600 }}>
                {pue < 1.4 ? 'Excellent' : pue < 1.6 ? 'Good' : pue < 2.0 ? 'Fair' : 'Poor'}
              </span>
            </div>
            <KpiSparkline data={trendBuf.map(b => b.pue)} color={pueColor} />
          </div>
        </div>

        {/* Active Alarms */}
        <div className="kpi-card">
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>Active Alarms</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: alarmColor, lineHeight: 1, marginBottom: 4 }}>
            {alarmCount}
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: alarmColor }}>
            {alarmCount === 0 ? '✓ All clear' : alarmCount === 1 ? '1 needs attention' : `${alarmCount} need attention`}
          </div>
        </div>
      </div>

      {/* ── 2-column layout ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>

        {/* LEFT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Live Power Trend */}
          <div className="card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Live Power Trend</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                  IT Load vs Total Facility · rolling 30-point window
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                {[{ label: 'IT Load', color: 'var(--accent)' }, { label: 'Total', color: '#8B5CF6' }].map(l => (
                  <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--muted)' }}>
                    <span style={{ width: 12, height: 2, borderRadius: 1, background: l.color, display: 'inline-block' }} />
                    {l.label}
                  </span>
                ))}
              </div>
            </div>
            {trendBuf.length === 0 ? (
              <div style={{
                height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', gap: 8, color: 'var(--muted)', fontSize: 14,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  border: '3px solid var(--border)', borderTopColor: 'var(--accent)',
                  animation: 'skeleton-pulse 1s linear infinite',
                }} />
                Collecting live data…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={trendBuf} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="gItLoad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="t" tick={{ fontSize: 11, fill: 'var(--muted)' }}
                    tickLine={false} axisLine={false}
                    interval={Math.max(1, Math.floor(trendBuf.length / 5))} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false}
                    axisLine={false} width={44}
                    tickFormatter={(v: number) => `${v.toFixed(0)}kW`} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 8, fontSize: 12,
                    }}
                    formatter={(v, n) => [
                      `${Number(v ?? 0).toFixed(1)} kW`,
                      n === 'itLoad' ? 'IT Load' : 'Total Power',
                    ]}
                  />
                  <Area type="monotone" dataKey="itLoad" stroke="var(--accent)" strokeWidth={2}
                    fill="url(#gItLoad)" dot={false} isAnimationActive={false} />
                  <Area type="monotone" dataKey="total" stroke="#8B5CF6" strokeWidth={2}
                    fill="url(#gTotal)" dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Hall Health compact table */}
          <div className="table-card">
            <div style={{
              padding: '14px 18px', borderBottom: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Data Hall Health</span>
              <a href="/facility-map" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
                View SLD →
              </a>
            </div>
            <table>
              <thead>
                <tr>
                  {['Hall', 'IT Load', 'Avg Inlet', 'CRAHs', 'Racks', 'Status'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(snapshot?.halls ?? []).map((hall: WsHallState) => {
                  const temp = hall.avg_inlet_c;
                  const tempColor = temp > 30 ? '#DC2626' : temp > 27 ? '#D97706' : 'var(--text)';
                  const status = deriveHallStatus(hall);
                  return (
                    <tr key={hall.id}>
                      <td style={{ fontWeight: 600 }}>{hall.name}</td>
                      <td>{hall.total_kw.toFixed(1)} kW</td>
                      <td style={{ color: tempColor, fontWeight: 500 }}>
                        {hall.avg_inlet_c.toFixed(1)}°C
                      </td>
                      <td>{hall.crah_online}/{hall.crah_total}</td>
                      <td>{hall.rack_count}</td>
                      <td>
                        <span style={{
                          padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                          background: status === 'OK' ? 'rgba(22,163,74,0.1)' : 'rgba(217,119,6,0.1)',
                          color: status === 'OK' ? '#16A34A' : '#D97706',
                        }}>
                          {status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {(snapshot?.halls ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px 0' }}>
                      Awaiting hall data…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT SIDEBAR */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Facility Status */}
          <div className="card-sm">
            <div style={{
              fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
              letterSpacing: '0.05em', marginBottom: 12,
            }}>
              Facility Status
            </div>
            {([
              {
                label: 'Generator',
                value: snapshot?.generator_state ?? '—',
                color: snapshot?.generator_state === 'STANDBY' ? '#6B7280' : '#16A34A',
              },
              {
                label: 'UPS Mode',
                value: snapshot?.ups?.[0]?.mode ?? '—',
                color: snapshot?.ups?.[0]?.mode === 'NORMAL' ? '#16A34A'
                  : snapshot?.ups?.[0]?.mode === 'BATTERY' ? '#DC2626' : '#D97706',
              },
              { label: 'Cooling',    value: 'NORMAL', color: '#16A34A' },
              { label: 'Fire Safety', value: 'ARMED',  color: '#16A34A' },
              { label: 'Access',     value: 'LOCKED', color: '#16A34A' },
            ] as { label: string; value: string; color: string }[]).map(item => (
              <div key={item.label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 0', borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>{item.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: item.color }}>{item.value}</span>
              </div>
            ))}
          </div>

          {/* PUE gauge */}
          {(() => {
            const pct = Math.min((pue - 1) / 1.5, 1);
            const r = 28, cx = 44, cy = 40;
            const start = -210 * Math.PI / 180;
            const sweep = 240 * Math.PI / 180;
            const end = start + pct * sweep;
            const bgEnd = start + sweep;
            function mkArc(a1: number, a2: number): string {
              const lf = (a2 - a1) > Math.PI ? 1 : 0;
              return `M ${(cx + r * Math.cos(a1)).toFixed(1)} ${(cy + r * Math.sin(a1)).toFixed(1)} A ${r} ${r} 0 ${lf} 1 ${(cx + r * Math.cos(a2)).toFixed(1)} ${(cy + r * Math.sin(a2)).toFixed(1)}`;
            }
            return (
              <div className="card-sm" style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
                  letterSpacing: '0.05em', marginBottom: 8,
                }}>
                  Power Usage Effectiveness
                </div>
                <svg width={88} height={64} viewBox="0 0 88 64" style={{ display: 'block', margin: '0 auto' }}>
                  <path d={mkArc(start, bgEnd)} fill="none" stroke="var(--border)" strokeWidth={6} strokeLinecap="round" />
                  {pct > 0.02 && (
                    <path d={mkArc(start, end)} fill="none" stroke={pueColor} strokeWidth={6} strokeLinecap="round" />
                  )}
                  <text x={cx} y={cy + 5} textAnchor="middle"
                    style={{ fontSize: 16, fontWeight: 800, fill: pueColor, fontFamily: 'inherit' }}>
                    {pue.toFixed(2)}
                  </text>
                </svg>
                <div style={{ fontSize: 12, fontWeight: 600, color: pueColor, marginTop: 4 }}>
                  {pue < 1.4 ? 'Excellent Efficiency' : pue < 1.6 ? 'Good' : pue < 2.0 ? 'Fair' : 'Needs Attention'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Target: &lt; 1.4</div>
              </div>
            );
          })()}

          {/* Subsystems */}
          <div className="card-sm">
            <div style={{
              fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
              letterSpacing: '0.05em', marginBottom: 10,
            }}>
              Subsystems
            </div>
            {([
              { name: 'UPS-01',         ok: snapshot?.ups?.[0]?.mode === 'NORMAL' },
              { name: 'Generator',      ok: snapshot?.generator_state !== 'RECOVERY' },
              { name: 'CRAH Units',     ok: true },
              { name: 'Fire Detection', ok: !(snapshot?.fire_safety?.zones.some(z => z.status === 'ALARM')) },
              { name: 'Access Control', ok: !(snapshot?.access_control?.intrusion_detected) },
              { name: 'Power Dist.',    ok: !(snapshot?.power_distribution?.branches.some(b => !b.breaker_on)) },
            ] as { name: string; ok: boolean }[]).map(sub => (
              <div key={sub.name} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '7px 0', borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{sub.name}</span>
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 12, fontWeight: 600, color: sub.ok ? '#16A34A' : '#DC2626',
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: sub.ok ? '#16A34A' : '#DC2626',
                  }} />
                  {sub.ok ? 'Normal' : 'Fault'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Active Alarms full-width ── */}
      <div className="table-card">
        <div style={{
          padding: '14px 18px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
            Active Alarms
            {alarmCount > 0 && (
              <span style={{
                marginLeft: 8, padding: '2px 8px', borderRadius: 6, fontSize: 12,
                fontWeight: 700, background: 'rgba(220,38,38,0.1)', color: '#DC2626',
              }}>
                {alarmCount}
              </span>
            )}
          </span>
          <a href="/alarms" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
            View all →
          </a>
        </div>
        {alarms.length === 0 ? (
          <div style={{ padding: '28px', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>✓</div>
            No active alarms
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                {['Severity', 'Source', 'Message', 'Time', 'Action'].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {alarms.slice(0, 5).map((alarm: AlarmRow) => {
                const sevColor = alarm.severity === 'CRITICAL' ? '#DC2626'
                  : alarm.severity === 'WARNING' ? '#D97706' : '#2563EB';
                return (
                  <tr key={alarm.id}>
                    <td>
                      <span style={{
                        padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                        background: `${sevColor}18`, color: sevColor, textTransform: 'uppercase',
                      }}>
                        {alarm.severity}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{alarm.source}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>{alarm.message}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 13, whiteSpace: 'nowrap' }}>
                      {timeAgo(alarm.raised_at * 1000)}
                    </td>
                    <td>
                      <button
                        onClick={() => void ackAlarm(alarm.id)}
                        style={{
                          padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                          border: '1px solid var(--border)', background: 'var(--surface)',
                          color: 'var(--text)', cursor: 'pointer',
                        }}
                      >
                        Ack
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
