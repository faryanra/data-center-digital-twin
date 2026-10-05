'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import {
  LineChart, Line,
  AreaChart, Area,
  BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { useFacilitySocket, getSnapshotCache } from '@/hooks/useFacilitySocket';
import type { WsFacilitySnapshot } from '@dctwin/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type EnergyPoint = {
  t: string;
  pue: number;
  total_kw: number;
  it_kw: number;
  cooling_kw: number;
  ups_load_pct: number;
};

type FacilityHistPoint = {
  ts: number;
  it_load_kw: number;
  total_power_kw: number;
  cooling_power_kw: number;
  pue: number;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const BUFFER_SIZE = 60;

const RANGES = [
  { label: '1H',  hours: 1 },
  { label: '6H',  hours: 6 },
  { label: '24H', hours: 24 },
  { label: '7D',  hours: 168 },
];

const CHART_STYLE = {
  grid: { stroke: 'var(--border)', strokeDasharray: '3 3' },
  axis: { stroke: '#6B7280', tick: { fill: '#6B7280', fontSize: 13 } },
  tooltip: { contentStyle: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 } },
  legend: { wrapperStyle: { fontSize: 14, color: '#9CA3AF' } },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function toPoint(snap: WsFacilitySnapshot): EnergyPoint {
  return {
    t: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    pue: Math.round(snap.pue * 100) / 100,
    total_kw: Math.round(snap.total_power_kw * 10) / 10,
    it_kw: Math.round(snap.it_load_kw * 10) / 10,
    cooling_kw: Math.round(snap.cooling.cooling_power_kw * 10) / 10,
    ups_load_pct: snap.ups[0]?.load_pct ?? 0,
  };
}

function formatTs(ts: string | number, hours: number): string {
  // Accepts an ISO string or epoch-seconds number.
  const d = new Date(typeof ts === 'number' ? ts * 1000 : ts);
  if (isNaN(d.getTime())) return String(ts);
  if (hours <= 24) {
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hhmm = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${mm}/${dd} ${hhmm}`;
}

function barColor(kw: number): string {
  if (kw > 8) return '#EF4444';
  if (kw >= 5) return '#F59E0B';
  return '#10B981';
}

function upsPillColor(pct: number): string {
  if (pct > 90) return '#EF4444';
  if (pct >= 75) return '#F59E0B';
  return '#10B981';
}

function deltaArrow(now: number, prev: number | undefined) {
  if (prev === undefined) return null;
  const diff = now - prev;
  if (Math.abs(diff) < 0.01) return null;
  const color = diff > 0 ? '#EF4444' : '#10B981';
  return (
    <span style={{ color, fontSize: 14, marginLeft: 4 }}>
      {diff > 0 ? '↑' : '↓'}{Math.abs(Math.round(diff * 10) / 10)}
    </span>
  );
}

// ── ConnDot ────────────────────────────────────────────────────────────────────

function ConnDot({ state }: { state: 'connecting' | 'open' | 'closed' | 'error' }) {
  const color =
    state === 'open'       ? 'var(--ok)' :
    state === 'connecting' ? 'var(--warn)' :
    'var(--crit)';
  return (
    <span
      title={`WebSocket: ${state}`}
      style={{
        display: 'inline-block', width: 8, height: 8,
        borderRadius: '50%', background: color,
        boxShadow: state === 'open' ? `0 0 6px ${color}` : undefined,
        verticalAlign: 'middle',
      }}
    />
  );
}

// ── Card wrapper ───────────────────────────────────────────────────────────────

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <p className="mb-3 text-sm font-semibold text-[var(--text)]">{title}</p>
      {children}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function EnergyClient() {
  const { snapshot, connState } = useFacilitySocket();
  const bufferRef = useRef<EnergyPoint[]>([]);
  const [points, setPoints] = useState<EnergyPoint[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>('—');

  // Seed the live buffer from cache after mount (avoids SSR hydration mismatch).
  useEffect(() => {
    const seeded = getSnapshotCache().map(toPoint);
    if (seeded.length === 0) return;
    bufferRef.current = seeded.slice(-BUFFER_SIZE);
    setPoints([...bufferRef.current]);
  }, []);

  const [range, setRange] = useState<number>(24);
  const [historyPoints, setHistoryPoints] = useState<EnergyPoint[] | null>(null);
  const [influxUnavailable, setInfluxUnavailable] = useState(false);

  useEffect(() => {
    if (!snapshot) return;
    const pt = toPoint(snapshot);
    bufferRef.current = [...bufferRef.current, pt].slice(-BUFFER_SIZE);
    setPoints([...bufferRef.current]);
    setLastUpdated(pt.t);
  }, [snapshot]);

  const fetchHistory = useCallback(async (hrs: number) => {
    try {
      const res = await fetch(`/api/proxy/facility/history?hours=${hrs}`, { cache: 'no-store' });
      if (!res.ok) {
        setHistoryPoints(null);
        setInfluxUnavailable(res.status !== 404);
        return;
      }
      const json = await res.json() as { points: FacilityHistPoint[] };
      const rows = json.points ?? [];
      // Too little server history yet → fall back to the live WS buffer.
      if (rows.length < 2) {
        setHistoryPoints(null);
        setInfluxUnavailable(false);
        return;
      }
      const combined: EnergyPoint[] = rows.map(p => ({
        t: formatTs(p.ts, hrs),
        pue: Math.round(p.pue * 100) / 100,
        total_kw: Math.round(p.total_power_kw * 10) / 10,
        it_kw: Math.round(p.it_load_kw * 10) / 10,
        cooling_kw: Math.round(p.cooling_power_kw * 10) / 10,
        ups_load_pct: 0,
      }));
      setHistoryPoints(combined);
      setInfluxUnavailable(false);
    } catch {
      setInfluxUnavailable(true);
      setHistoryPoints(null);
    }
  }, []);

  useEffect(() => {
    void fetchHistory(range);
  }, [range, fetchHistory]);

  // Use history data when available, fall back to WS buffer
  const chartPoints = historyPoints ?? points;

  const tickEvery = Math.max(1, Math.ceil(chartPoints.length / 10));
  const tickFmt   = (_: string, i: number) => i % tickEvery === 0 ? _ : '';

  const latest = points[points.length - 1];
  const prev60 = points.length >= 12 ? points[points.length - 12] : undefined;

  const ups      = snapshot?.ups[0];
  const racks    = snapshot?.racks ?? [];
  const rackBars = racks.map((r) => ({ name: r.id, power_kw: r.kw }));

  return (
    <div className="page-content">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">Energy Analytics</h1>
          <p className="text-sm text-[var(--muted)]">
            {historyPoints
              ? `Historical — last ${RANGES.find(r => r.hours === range)?.label ?? range}`
              : 'Live rolling window'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Range pills */}
          <div style={{
            display: 'flex', gap: 4, padding: 4,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 4,
          }}>
            {RANGES.map(r => (
              <button
                key={r.hours}
                onClick={() => setRange(r.hours)}
                style={{
                  padding: '5px 12px', borderRadius: 2, fontSize: 13,
                  fontWeight: range === r.hours ? 600 : 400,
                  background: range === r.hours ? 'var(--accent)' : 'transparent',
                  color: range === r.hours ? '#fff' : 'var(--muted)',
                  border: 'none', cursor: 'pointer',
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <ConnDot state={connState} />
            <span>Live</span>
          </div>
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="grid-4">
        {[
          { label: 'Current PUE',     value: latest?.pue.toFixed(2)        ?? '—', prev: prev60?.pue },
          { label: 'IT Load (kW)',    value: latest?.it_kw.toFixed(1)      ?? '—', prev: prev60?.it_kw },
          { label: 'Cooling (kW)',    value: latest?.cooling_kw.toFixed(1) ?? '—', prev: prev60?.cooling_kw },
          { label: 'Total Power (kW)', value: latest?.total_kw.toFixed(1)  ?? '—', prev: prev60?.total_kw },
        ].map(({ label, value, prev }) => (
          <div key={label} className="card-sm">
            <p className="text-sm text-[var(--muted)]">{label}</p>
            <p className="mt-1 text-2xl font-bold text-[var(--text)]">
              {value}
              {typeof prev === 'number' && latest
                ? deltaArrow(parseFloat(value), prev)
                : null}
            </p>
          </div>
        ))}
      </div>

      {/* ── Charts 2×2 ── */}
      {influxUnavailable && points.length >= 2 && (
        <div style={{ fontSize: 12, color: '#D97706', marginBottom: 8 }}>
          Using live WebSocket data — historical chart requires InfluxDB
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">

        {/* 1. PUE Over Time (always WS buffer) */}
        <ChartCard title="PUE Over Time">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={points}>
              <CartesianGrid {...CHART_STYLE.grid} />
              <XAxis dataKey="t" {...CHART_STYLE.axis} tickFormatter={tickFmt} />
              <YAxis
                domain={[1.0, 2.5]}
                {...CHART_STYLE.axis}
                label={{ value: 'PUE', angle: -90, position: 'insideLeft', fill: '#6B7280', fontSize: 13 }}
              />
              <Tooltip {...CHART_STYLE.tooltip} />
              <ReferenceLine y={1.5} stroke="#10B981" strokeDasharray="4 4"
                label={{ value: '1.5 target', fill: '#10B981', fontSize: 10, position: 'insideTopRight' }} />
              <ReferenceLine y={1.6} stroke="#F59E0B" strokeDasharray="4 4"
                label={{ value: '1.6 avg', fill: '#F59E0B', fontSize: 10, position: 'insideTopRight' }} />
              <ReferenceLine y={1.8} stroke="#EF4444" strokeDasharray="4 4"
                label={{ value: '1.8 poor', fill: '#EF4444', fontSize: 10, position: 'insideTopRight' }} />
              <Line type="monotone" dataKey="pue" stroke="#3B82F6" dot={false} strokeWidth={2} name="PUE" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 2. Total Facility Power (uses chartPoints — history or buffer) */}
        <ChartCard title={`Total Facility Power (kW) — ${historyPoints ? `Last ${RANGES.find(r => r.hours === range)?.label}` : 'Live'}`}>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartPoints}>
              <CartesianGrid {...CHART_STYLE.grid} />
              <XAxis dataKey="t" {...CHART_STYLE.axis} tickFormatter={tickFmt} />
              <YAxis
                {...CHART_STYLE.axis}
                label={{ value: 'kW', angle: -90, position: 'insideLeft', fill: '#6B7280', fontSize: 13 }}
              />
              <Tooltip {...CHART_STYLE.tooltip} />
              <Legend {...CHART_STYLE.legend} iconType="circle" />
              <Area type="monotone" dataKey="it_kw"      stackId="1" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.35} name="IT Load" />
              <Area type="monotone" dataKey="cooling_kw" stackId="1" stroke="#10B981" fill="#10B981" fillOpacity={0.35} name="Cooling" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 3. Per-Rack Power (always live) */}
        <ChartCard title="Per-Rack Power (kW)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={rackBars} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid {...CHART_STYLE.grid} horizontal={false} />
              <XAxis type="number" {...CHART_STYLE.axis} />
              <YAxis type="category" dataKey="name" {...CHART_STYLE.axis} width={52} tick={{ fill: '#6B7280', fontSize: 9 }} />
              <Tooltip {...CHART_STYLE.tooltip} />
              <Bar dataKey="power_kw" name="kW" radius={[0, 3, 3, 0]}>
                {rackBars.map((entry, i) => (
                  <Cell key={i} fill={barColor(entry.power_kw)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 4. UPS Status */}
        <ChartCard title="UPS Status">
          <div className="flex gap-4">
            <div className="flex-1 rounded-lg border border-[var(--border)] p-4 text-center">
              <p className="text-sm text-[var(--muted)]">UPS Load</p>
              <p className="mt-1 text-3xl font-bold text-[var(--text)]">
                {ups ? `${ups.load_pct}%` : '—'}
              </p>
              {ups && (
                <span
                  className="mt-2 inline-block rounded-full px-2 py-0.5 text-sm font-semibold"
                  style={{ background: `${upsPillColor(ups.load_pct)}33`, color: upsPillColor(ups.load_pct) }}
                >
                  {ups.load_pct > 90 ? 'CRITICAL' : ups.load_pct >= 75 ? 'WARNING' : 'NORMAL'}
                </span>
              )}
            </div>
            <div className="flex-1 rounded-lg border border-[var(--border)] p-4 text-center">
              <p className="text-sm text-[var(--muted)]">Battery</p>
              <p className="mt-1 text-3xl font-bold text-[var(--text)]">
                {ups ? `${ups.battery_pct}%` : '—'}
              </p>
              {ups && (
                <span
                  className="mt-2 inline-block rounded-full px-2 py-0.5 text-sm font-semibold"
                  style={{
                    background: ups.mode === 'NORMAL' ? '#10B98133' : '#F59E0B33',
                    color:      ups.mode === 'NORMAL' ? '#10B981'   : '#F59E0B',
                  }}
                >
                  {ups.mode}
                </span>
              )}
            </div>
          </div>
          <p className="mt-3 text-right text-sm text-[var(--muted)]">Updated {lastUpdated}</p>
        </ChartCard>

      </div>

      {/* ── Thermal Delta + Generator ── */}
      <div className="grid gap-4 md:grid-cols-2">

        <ChartCard title="Thermal Delta">
          {snapshot ? (
            <div className="space-y-4">
              <div className="flex justify-around">
                <div className="text-center">
                  <p className="text-sm text-[var(--muted)]">Supply</p>
                  <p className="mt-1 text-2xl font-bold text-[var(--ok)]">
                    {snapshot.cooling.supply_temp_c.toFixed(1)}°C
                  </p>
                </div>
                <div className="flex items-center text-xl text-[var(--muted)]">→</div>
                <div className="text-center">
                  <p className="text-sm text-[var(--muted)]">Return</p>
                  <p className="mt-1 text-2xl font-bold text-[var(--warn)]">
                    {snapshot.cooling.return_temp_c.toFixed(1)}°C
                  </p>
                </div>
                <div className="flex items-center text-xl text-[var(--muted)]">Δ</div>
                <div className="text-center">
                  <p className="text-sm text-[var(--muted)]">Delta</p>
                  <p className="mt-1 text-2xl font-bold text-[var(--text)]">
                    {(snapshot.cooling.return_temp_c - snapshot.cooling.supply_temp_c).toFixed(1)}°C
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-4 py-2">
                <span className="text-sm text-[var(--muted)]">COP</span>
                <span className="text-sm font-bold text-[var(--text)]">{snapshot.cooling.cop.toFixed(2)}</span>
              </div>
            </div>
          ) : (
            <div className="h-24 animate-pulse rounded-lg" style={{ background: 'var(--border)' }} />
          )}
        </ChartCard>

        <ChartCard title="Generator">
          {snapshot ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--muted)]">State</span>
                <span
                  className="rounded-full px-2.5 py-0.5 text-sm font-bold"
                  style={{
                    background:
                      snapshot.generator_state === 'TRANSFERRED' ? '#10B98122' :
                      snapshot.generator_state === 'STANDBY'     ? '#6B728022' : '#F59E0B22',
                    color:
                      snapshot.generator_state === 'TRANSFERRED' ? '#10B981' :
                      snapshot.generator_state === 'STANDBY'     ? '#9CA3AF' : '#F59E0B',
                  }}
                >
                  {snapshot.generator_state}
                </span>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-[var(--muted)]">Fuel Level</span>
                  <span className="font-semibold text-[var(--text)]">
                    {snapshot.generator_fuel_pct.toFixed(0)}%
                  </span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${snapshot.generator_fuel_pct}%`,
                      background:
                        snapshot.generator_fuel_pct < 20 ? '#EF4444' :
                        snapshot.generator_fuel_pct < 50 ? '#F59E0B' : '#10B981',
                      borderRadius: 9999,
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {snapshot.generator_fuel_pct < 20 ? 'Low — refill required' :
                   snapshot.generator_fuel_pct < 50 ? 'Schedule refill' : 'Adequate'}
                </p>
              </div>
              {typeof snapshot.gen_auto_start === 'boolean' && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--muted)]">Auto-start</span>
                  <span style={{ color: snapshot.gen_auto_start ? 'var(--ok)' : 'var(--crit)' }}>
                    {snapshot.gen_auto_start ? 'ENABLED' : 'DISABLED'}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="h-24 animate-pulse rounded-lg" style={{ background: 'var(--border)' }} />
          )}
        </ChartCard>

      </div>
    </div>
  );
}
