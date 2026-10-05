'use client';

import { useState } from 'react';
import { useFacilitySocket } from '@/hooks/useFacilitySocket';
import { useAuth } from '@/lib/auth/context';
import type { WsUpsState, WsPduState, WsRackState, WsFacilitySnapshot } from '@dctwin/types';

// ── Status helpers ─────────────────────────────────────────────────────────────

type StatusKey = 'OK' | 'WARNING' | 'CRITICAL';

const STATUS_COLOR: Record<StatusKey, string> = {
  OK:       '#10B981',
  WARNING:  '#F59E0B',
  CRITICAL: '#EF4444',
};

function upsStatus(u: WsUpsState): StatusKey {
  if (u.mode === 'FAULT' || u.load_pct > 90) return 'CRITICAL';
  if (u.mode === 'BATTERY' || u.mode === 'BYPASS' || !u.input_ok) return 'WARNING';
  return 'OK';
}

function pduStatus(p: WsPduState): StatusKey {
  if (p.load_pct >= 90) return 'CRITICAL';
  if (p.load_pct >= 75) return 'WARNING';
  return 'OK';
}

function rackStatus(r: WsRackState): StatusKey {
  if (r.inlet_c >= 35) return 'CRITICAL';
  if (r.inlet_c >= 27) return 'WARNING';
  return 'OK';
}

function barColor(pct: number): string {
  if (pct >= 90) return '#EF4444';
  if (pct >= 75) return '#F59E0B';
  return '#10B981';
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function UpsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="4" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 8v4M8 10h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PduIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="7" width="14" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="7"  cy="10" r="1" fill="currentColor" />
      <circle cx="10" cy="10" r="1" fill="currentColor" />
      <circle cx="13" cy="10" r="1" fill="currentColor" />
    </svg>
  );
}

function RackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="4" y="2" width="12" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="4" y1="7"  x2="16" y2="7"  stroke="currentColor" strokeWidth="1" />
      <line x1="4" y1="11" x2="16" y2="11" stroke="currentColor" strokeWidth="1" />
      <line x1="4" y1="15" x2="16" y2="15" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

// ── ConnDot ────────────────────────────────────────────────────────────────────

function ConnDot({ state }: { state: 'connecting' | 'open' | 'closed' | 'error' }) {
  const color =
    state === 'open' ? 'var(--ok)' :
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

// ── ProgressBar ───────────────────────────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
      <div
        style={{
          height: '100%',
          width: `${clamped}%`,
          background: barColor(clamped),
          borderRadius: '9999px',
          transition: 'width 0.4s ease',
        }}
      />
    </div>
  );
}

// ── Metric tile ────────────────────────────────────────────────────────────────

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-base font-bold text-[var(--text)]">{value}</span>
      <span className="text-[12px] text-[var(--muted)]">{label}</span>
    </div>
  );
}

// ── Equipment cards ────────────────────────────────────────────────────────────

function UpsCard({ u, isAdmin = false }: { u: WsUpsState; isAdmin?: boolean }) {
  const [busy, setBusy] = useState(false);
  const st = upsStatus(u);
  const color = STATUS_COLOR[st];

  async function handleBypass() {
    setBusy(true);
    try {
      await fetch('/api/proxy/control/ups/bypass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: u.mode !== 'BYPASS' }),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2" style={{ color: 'var(--muted)' }}>
          <UpsIcon />
          <span className="text-sm font-semibold text-[var(--text)]">{u.id}</span>
        </div>
        <span className="rounded-full px-2 py-0.5 text-[12px] font-bold"
          style={{ background: `${color}22`, color }}>
          {st}
        </span>
      </div>
      <div className="mt-3 flex gap-4">
        <Metric value={`${u.load_pct}%`}    label="Load" />
        <Metric value={`${u.battery_pct}%`} label="Battery" />
        <Metric value={u.mode}              label="Mode" />
      </div>
      <ProgressBar pct={u.load_pct} />
      {isAdmin && (
        <button
          onClick={handleBypass}
          disabled={busy}
          className="mt-3 w-full rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            background: u.mode === 'BYPASS' ? 'var(--warn-soft)' : 'var(--surface-2)',
            color: u.mode === 'BYPASS' ? 'var(--warn)' : 'var(--muted)',
            border: '1px solid var(--border)',
            opacity: busy ? 0.5 : 1,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          {u.mode === 'BYPASS' ? 'Bypass Active — Disable' : 'Enable Bypass'}
        </button>
      )}
    </div>
  );
}

function PduCard({ p }: { p: WsPduState }) {
  const st = pduStatus(p);
  const color = STATUS_COLOR[st];
  return (
    <div className="card-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2" style={{ color: 'var(--muted)' }}>
          <PduIcon />
          <span className="text-sm font-semibold text-[var(--text)]">{p.id}</span>
        </div>
        <span className="rounded-full px-2 py-0.5 text-[12px] font-bold"
          style={{ background: `${color}22`, color }}>
          {st}
        </span>
      </div>
      <div className="mt-3 flex gap-4">
        <Metric value={`${p.load_pct}%`}   label="Load" />
        <Metric value={`${p.load_kw} kW`}  label="Power" />
        <Metric value={`${p.racks.length}`} label="Racks" />
      </div>
      <ProgressBar pct={p.load_pct} />
    </div>
  );
}

function RackCard({ r }: { r: WsRackState }) {
  const st = rackStatus(r);
  const color = STATUS_COLOR[st];
  const tempPct = Math.min(100, (r.inlet_c / 40) * 100);
  return (
    <div className="card-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2" style={{ color: 'var(--muted)' }}>
          <RackIcon />
          <span className="text-sm font-semibold text-[var(--text)]">{r.id}</span>
        </div>
        <span className="rounded-full px-2 py-0.5 text-[12px] font-bold"
          style={{ background: `${color}22`, color }}>
          {st}
        </span>
      </div>
      <div className="mt-3 flex gap-4">
        <Metric value={`${r.inlet_c}°C`}  label="Inlet" />
        <Metric value={`${r.kw} kW`}      label="Power" />
        <Metric value={`${r.load_pct}%`}  label="IT Load" />
      </div>
      <ProgressBar pct={tempPct} />
    </div>
  );
}

// ── Generator card ─────────────────────────────────────────────────────────────

function GeneratorCard({ snapshot, isAdmin }: { snapshot: WsFacilitySnapshot; isAdmin: boolean }) {
  const [busy, setBusy] = useState(false);
  const fuel = snapshot.generator_fuel_pct;
  const fuelColor = fuel < 20 ? '#EF4444' : fuel < 50 ? '#F59E0B' : '#10B981';
  const stateColor =
    snapshot.generator_state === 'TRANSFERRED' ? '#10B981' :
    snapshot.generator_state === 'STARTING'    ? '#F59E0B' :
    '#9CA3AF';

  async function toggleAutoStart() {
    setBusy(true);
    try {
      await fetch('/api/proxy/control/generator/auto-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !snapshot.gen_auto_start }),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ color: 'var(--muted)' }}>
            <rect x="2" y="6" width="16" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M6 6V4M14 6V4M5 10h2M9 10h2M13 10h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="text-sm font-semibold text-[var(--text)]">GEN-01</span>
        </div>
        <span className="rounded-full px-2 py-0.5 text-[12px] font-bold"
          style={{ background: stateColor + '22', color: stateColor }}>
          {snapshot.generator_state}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-[var(--muted)]">Fuel</span>
            <span className="font-semibold text-[var(--text)]">{fuel.toFixed(0)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
            <div style={{
              height: '100%', width: `${fuel}%`, background: fuelColor,
              borderRadius: 9999, transition: 'width 0.4s ease',
            }} />
          </div>
          <p className="mt-1 text-[12px] text-[var(--muted)]">
            {fuel < 20 ? 'Low — refill required' : fuel < 50 ? 'Moderate' : 'Adequate'}
          </p>
        </div>

        {isAdmin && typeof snapshot.gen_auto_start === 'boolean' && (
          <button
            onClick={toggleAutoStart}
            disabled={busy}
            className="w-full rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: snapshot.gen_auto_start ? 'var(--ok-soft)' : 'var(--crit-soft)',
              color: snapshot.gen_auto_start ? 'var(--ok)' : 'var(--crit)',
              border: `1px solid ${snapshot.gen_auto_start ? 'var(--ok)' : 'var(--crit)'}`,
              opacity: busy ? 0.5 : 1,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Auto-start: {snapshot.gen_auto_start ? 'ON' : 'OFF'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── CRAH summary card ──────────────────────────────────────────────────────────

function CrahSummaryCard({ snapshot }: { snapshot: WsFacilitySnapshot }) {
  const { crah_online, crah_total, supply_temp_c, return_temp_c, cop } = snapshot.cooling;
  const allOnline = crah_online === crah_total;
  return (
    <div className="card-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ color: 'var(--muted)' }}>
            <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 6v8M6 10h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="text-sm font-semibold text-[var(--text)]">CRAH Units</span>
        </div>
        <span className="rounded-full px-2 py-0.5 text-[12px] font-bold"
          style={{
            background: allOnline ? '#10B98122' : '#F59E0B22',
            color: allOnline ? '#10B981' : '#F59E0B',
          }}>
          {crah_online}/{crah_total} online
        </span>
      </div>
      <div className="mt-3 flex gap-4">
        <Metric value={`${supply_temp_c.toFixed(1)}°C`} label="Supply" />
        <Metric value={`${return_temp_c.toFixed(1)}°C`} label="Return" />
        <Metric value={cop.toFixed(2)}                  label="COP" />
      </div>
      <ProgressBar pct={(crah_online / crah_total) * 100} />
    </div>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="card-sm animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-4 w-24 rounded" style={{ background: 'var(--border)' }} />
        <div className="h-4 w-16 rounded-full" style={{ background: 'var(--border)' }} />
      </div>
      <div className="mt-4 flex gap-4">
        <div className="h-8 w-14 rounded" style={{ background: 'var(--border)' }} />
        <div className="h-8 w-14 rounded" style={{ background: 'var(--border)' }} />
        <div className="h-8 w-14 rounded" style={{ background: 'var(--border)' }} />
      </div>
      <div className="mt-4 h-1.5 w-full rounded-full" style={{ background: 'var(--border)' }} />
    </div>
  );
}

// ── Filter pills ───────────────────────────────────────────────────────────────

type TypeFilter = 'All' | 'UPS' | 'PDU' | 'Rack';
type StatusFilter = 'All' | 'OK' | 'WARNING' | 'CRITICAL';

function Pills<T extends string>({
  options, active, onSelect,
}: { options: T[]; active: T; onSelect: (v: T) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onSelect(o)}
          style={{
            borderRadius: 9999,
            padding: '4px 12px',
            fontSize: 12,
            fontWeight: 500,
            border: 'none',
            cursor: 'pointer',
            transition: 'background 0.15s, color 0.15s',
            background: active === o ? 'var(--accent)' : 'var(--border)',
            color: active === o ? '#fff' : 'var(--muted)',
          }}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

type EquipItem =
  | { kind: 'ups'; data: WsUpsState;  status: StatusKey }
  | { kind: 'pdu'; data: WsPduState;  status: StatusKey }
  | { kind: 'rack'; data: WsRackState; status: StatusKey };

export function EquipmentClient() {
  const { snapshot, connState } = useFacilitySocket();
  const { user } = useAuth();
  const [typeFilter, setTypeFilter]     = useState<TypeFilter>('All');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const isAdmin = user?.role === 'ADMIN';

  if (!snapshot) {
    return (
      <div className="page-content">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-[var(--text)]">Equipment</h1>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  const items: EquipItem[] = [
    ...snapshot.ups.sort((a, b) => a.id.localeCompare(b.id)).map((u): EquipItem =>
      ({ kind: 'ups', data: u, status: upsStatus(u) })),
    ...snapshot.pdus.sort((a, b) => a.id.localeCompare(b.id)).map((p): EquipItem =>
      ({ kind: 'pdu', data: p, status: pduStatus(p) })),
    ...snapshot.racks.sort((a, b) => a.id.localeCompare(b.id)).map((r): EquipItem =>
      ({ kind: 'rack', data: r, status: rackStatus(r) })),
  ];

  const filtered = items.filter((item) => {
    const typeOk = typeFilter === 'All' ||
      (typeFilter === 'UPS'  && item.kind === 'ups')  ||
      (typeFilter === 'PDU'  && item.kind === 'pdu')  ||
      (typeFilter === 'Rack' && item.kind === 'rack');
    const statusOk = statusFilter === 'All' || item.status === statusFilter;
    return typeOk && statusOk;
  });

  return (
    <div className="page-content">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-[var(--text)]">Equipment</h1>
        <div className="ml-auto flex items-center gap-1.5 text-sm text-[var(--muted)]">
          <ConnDot state={connState} />
          <span>Live</span>
        </div>
      </div>

      {/* ── Infrastructure section (always visible, not filtered) ── */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          Infrastructure
        </p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <GeneratorCard snapshot={snapshot} isAdmin={isAdmin} />
          <CrahSummaryCard snapshot={snapshot} />
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
        <p
          className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]"
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <span>IT Equipment</span>
          <span
            className="rounded-full text-[12px] font-semibold normal-case"
            style={{ background: 'var(--border)', color: 'var(--muted)', padding: '2px 8px' }}
          >
            {filtered.length}
          </span>
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <Pills<TypeFilter>
            options={['All', 'UPS', 'PDU', 'Rack']}
            active={typeFilter}
            onSelect={setTypeFilter}
          />
          <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
          <Pills<StatusFilter>
            options={['All', 'OK', 'WARNING', 'CRITICAL']}
            active={statusFilter}
            onSelect={setStatusFilter}
          />
        </div>
      </div>

      {/* ── Grid ── */}
      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-[var(--muted)]">No equipment matches the selected filters.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => {
            if (item.kind === 'ups')  return <UpsCard  key={item.data.id} u={item.data} isAdmin={isAdmin} />;
            if (item.kind === 'pdu')  return <PduCard  key={item.data.id} p={item.data} />;
            return                           <RackCard  key={item.data.id} r={item.data} />;
          })}
        </div>
      )}
    </div>
  );
}
