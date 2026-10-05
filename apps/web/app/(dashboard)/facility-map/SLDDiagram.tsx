'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { WsFacilitySnapshot, WsUpsState } from '@dctwin/types';

// ── Status types & colors ─────────────────────────────────────────────────────

type SldNodeStatus = 'ok' | 'warning' | 'critical' | 'standby' | 'starting';

function statusColor(s: SldNodeStatus): string {
  if (s === 'ok')       return '#16A34A';
  if (s === 'warning')  return '#D97706';
  if (s === 'critical') return '#DC2626';
  if (s === 'starting') return '#2563EB';
  return '#6B7280'; // standby
}

// ── Status derivation ─────────────────────────────────────────────────────────

function upsStatus(u: WsUpsState | undefined): SldNodeStatus {
  if (!u) return 'standby';
  if (u.mode === 'FAULT') return 'critical';
  if (u.mode === 'BATTERY') return 'warning';
  if (u.mode === 'BYPASS') return 'standby';
  return 'ok';
}

function genStatus(state: string | undefined): SldNodeStatus {
  if (!state || state === 'STANDBY') return 'standby';
  if (state === 'STARTING') return 'starting';
  if (state === 'TRANSFERRED') return 'ok';
  return 'warning'; // RECOVERY
}

function pduStatus(loadPct: number): SldNodeStatus {
  if (loadPct >= 90) return 'critical';
  if (loadPct >= 75) return 'warning';
  return 'ok';
}

function hallStatus(racksAbove30: boolean, racksAbove27: boolean, hasCritAlarm: boolean): SldNodeStatus {
  if (hasCritAlarm || racksAbove30) return 'critical';
  if (racksAbove27) return 'warning';
  return 'ok';
}

// ── Fault glow ────────────────────────────────────────────────────────────────

function nodeGlow(deviceId: string, activeFault: string | null): CSSProperties {
  const map: Record<string, { ids: string[]; color: string }> = {
    utility_loss:   { ids: ['GRID', 'XFMR'], color: '#DC2626' },
    crah_a_trip:    { ids: ['CRAH-A'],        color: '#D97706' },
    rack_overload:  { ids: ['RACK-A01'],      color: '#DC2626' },
    generator_fail: { ids: ['GEN-01'],        color: '#D97706' },
  };
  if (!activeFault) return {};
  const entry = map[activeFault];
  if (!entry || !entry.ids.includes(deviceId)) return {};
  return { filter: `drop-shadow(0 0 6px ${entry.color}) drop-shadow(0 0 12px ${entry.color}88)` };
}

// ── SldNode component ─────────────────────────────────────────────────────────

interface SldNodeProps {
  x: number; y: number;
  w?: number; h?: number;
  label: string;
  sublabel?: string;
  status: SldNodeStatus;
}

function SldNode({ x, y, w = 140, h = 52, label, sublabel, status }: SldNodeProps) {
  const clr = statusColor(status);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={2}
        fill="var(--surface)" stroke="var(--border)" strokeWidth={1} />
      {/* left accent bar */}
      <rect x={x} y={y} width={3} height={h} rx={0} fill={clr} />
      <text x={x + 12} y={y + 20} fontSize={12} fontWeight={600} fill="var(--text)"
        fontFamily="inherit">
        {label}
      </text>
      {sublabel && (
        <text x={x + 12} y={y + 36} fontSize={11} fill="var(--muted)" fontFamily="inherit">
          {sublabel}
        </text>
      )}
      {/* status indicator dot */}
      <circle cx={x + w - 10} cy={y + 10} r={4} fill={clr} />
    </g>
  );
}

// ── Connection line (neutral, 90° elbows via path) ────────────────────────────

function ConnLine({ d, dashed = false }: { d: string; dashed?: boolean }) {
  return (
    <path
      d={d}
      stroke="var(--border)"
      strokeWidth={1.5}
      strokeDasharray={dashed ? '5 3' : undefined}
      fill="none"
    />
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

const LEGEND_ITEMS: [SldNodeStatus, string][] = [
  ['ok',       'Normal'],
  ['warning',  'Warning'],
  ['critical', 'Critical'],
  ['standby',  'Standby'],
];

// ── Main SLD Diagram ──────────────────────────────────────────────────────────

export function SLDDiagram({
  snapshot,
  activeFault,
}: {
  snapshot: WsFacilitySnapshot | null;
  activeFault: string | null;
}) {
  const [tip, setTip] = useState<{ x: number; y: number; title: string; rows: string[] } | null>(null);

  function getNodeInfo(id: string): { title: string; rows: string[] } {
    if (!snapshot) return { title: id, rows: ['No data available'] };
    const s = snapshot;
    const fmt = (n: number | undefined, u = '') => n != null ? `${n.toFixed(1)}${u}` : '—';
    switch (id) {
      case 'GRID':
        return { title: 'Utility Grid', rows: ['Voltage: 11kV / 400V', `Status: ${s.utility_ok ? 'LIVE' : 'FAULT'}`, 'Feed: Normal'] };
      case 'XFMR':
        return { title: 'Main Transformer', rows: [`Total Load: ${fmt(s.total_power_kw, ' kW')}`, 'Capacity: 800 kVA', 'Cooling: ONAN'] };
      case 'UPS-01': {
        const u = s.ups[0];
        return { title: 'UPS-01 (600 kVA)', rows: [`Mode: ${u?.mode ?? '—'}`, `Load: ${fmt(u?.load_pct, '%')}`, `Battery: ${fmt(u?.battery_pct, '%')}`] };
      }
      case 'GEN-01':
        return { title: 'Generator GEN-01', rows: [`State: ${s.generator_state ?? '—'}`, `Fuel: ${fmt(s.generator_fuel_pct, '%')}`, 'Capacity: 500 kVA'] };
      default: {
        if (id.startsWith('PDU')) {
          const p = s.pdus.find(x => x.id.toUpperCase() === id);
          return p
            ? { title: id, rows: [`Load: ${fmt(p.load_kw, ' kW')}`, `Util: ${p.load_pct.toFixed(0)}%`] }
            : { title: id, rows: ['—'] };
        }
        if (id === 'HALL-A' || id === 'HALL-B') {
          const hallId = id === 'HALL-A' ? 'data-hall-a' : 'data-hall-b';
          const h = s.halls?.find(x => x.id === hallId);
          return h
            ? { title: id, rows: [`IT Load: ${fmt(h.total_kw, ' kW')}`, `Avg Inlet: ${fmt(h.avg_inlet_c, '°C')}`, `Racks: ${h.rack_count}`] }
            : { title: id, rows: ['—'] };
        }
        return { title: id, rows: [] };
      }
    }
  }

  // ── Node statuses ──
  const utilSt: SldNodeStatus = snapshot ? (snapshot.utility_ok ? 'ok' : 'critical') : 'standby';
  const xfmrSt: SldNodeStatus = snapshot ? (snapshot.utility_ok ? 'ok' : 'warning') : 'standby';
  const upsSt  = upsStatus(snapshot?.ups[0]);
  const genSt  = genStatus(snapshot?.generator_state);
  const genIsStandby = genSt === 'standby';

  // PDUs (up to 4)
  const pdus     = snapshot?.pdus ?? [];
  const pduCount = Math.min(Math.max(pdus.length, 1), 4);

  // Halls
  const racksA = snapshot?.racks.filter(r => r.id.startsWith('rack-a')) ?? [];
  const racksB = snapshot?.racks.filter(r => r.id.startsWith('rack-b')) ?? [];
  const hallAKw = snapshot?.halls?.find(h => h.id === 'data-hall-a')?.total_kw
    ?? racksA.reduce((s, r) => s + r.kw, 0);
  const hallBKw = snapshot?.halls?.find(h => h.id === 'data-hall-b')?.total_kw
    ?? racksB.reduce((s, r) => s + r.kw, 0);

  const hallASt = hallStatus(
    racksA.some(r => r.inlet_c >= 30),
    racksA.some(r => r.inlet_c >= 27),
    racksA.some(r => r.status === 'CRITICAL'),
  );
  const hallBSt = hallStatus(
    racksB.some(r => r.inlet_c >= 30),
    racksB.some(r => r.inlet_c >= 27),
    racksB.some(r => r.status === 'CRITICAL'),
  );

  // ── Layout constants ──
  const VIEW_W = 800;
  const NODE_W = 140;
  const NODE_H = 52;
  const HALL_W = 180;

  // Vertical layers
  const Y_GRID  = 20;
  const Y_XFMR  = 115;
  const Y_UPS   = 210;
  const Y_GEN   = 160;  // same level as between XFMR and UPS, offset right
  const Y_BUS   = 295;  // horizontal bus below UPS
  const Y_PDU   = 335;
  const Y_HALL  = 440;

  // UPS and XFMR/GRID all on center x=400
  const CX_SPINE = 400;
  const CX_GEN   = 620;  // right of center

  // PDU centers: evenly spaced across 100..700
  const PDU_SPAN_START = 90;
  const PDU_SPAN_END   = 710;
  const pduCenters = Array.from({ length: pduCount }, (_, i) =>
    Math.round(PDU_SPAN_START + ((i + 0.5) * (PDU_SPAN_END - PDU_SPAN_START)) / pduCount),
  );

  // Hall centers: left and right groups of PDUs
  const halfCount  = Math.ceil(pduCount / 2);
  const hallACX    = pduCount <= 2
    ? (pduCenters[0] ?? CX_SPINE - 160)
    : Math.round(pduCenters.slice(0, halfCount).reduce((s, x) => s + x, 0) / halfCount);
  const hallBCX    = pduCount === 1
    ? (pduCenters[0] ?? CX_SPINE + 160)
    : Math.round(pduCenters.slice(halfCount).reduce((s, x) => s + x, 0) / Math.max(1, pduCount - halfCount));

  // Helper: node top-left from center
  function nx(cx: number, w = NODE_W) { return cx - w / 2; }

  // Bottom-center of a node
  function nb(cx: number, y: number, h = NODE_H) { return [cx, y + h] as const; }
  // Top-center of a node
  function nt(cx: number, y: number) { return [cx, y] as const; }

  const ups0 = snapshot?.ups[0];
  const [, gridBot] = nb(CX_SPINE, Y_GRID);
  const [, xfmrTop] = nt(CX_SPINE, Y_XFMR);
  const [, xfmrBot] = nb(CX_SPINE, Y_XFMR);
  const [, upsTop]  = nt(CX_SPINE, Y_UPS);
  const [, upsBot]  = nb(CX_SPINE, Y_UPS);
  const genTopCX    = CX_GEN;
  const [, genBot]  = nb(CX_GEN, Y_GEN, NODE_H);
  const [, pduBot]  = [0, Y_PDU + NODE_H] as const;

  const VIEW_H = Y_HALL + NODE_H + 50; // room for legend below

  return (
    <>
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width="100%"
      style={{ display: 'block', maxHeight: 520, fontFamily: 'inherit' }}
      aria-label="Single-Line Electrical Diagram"
    >
      {/* ── Connection lines ── */}

      {/* GRID → XFMR */}
      <ConnLine d={`M ${CX_SPINE},${gridBot} L ${CX_SPINE},${xfmrTop}`} />

      {/* XFMR → UPS (straight) */}
      <ConnLine d={`M ${CX_SPINE},${xfmrBot} L ${CX_SPINE},${upsTop}`} />

      {/* XFMR → GEN (via ATS, dashed when standby) */}
      <ConnLine
        d={`M ${CX_SPINE},${xfmrBot} L ${CX_SPINE},${Y_XFMR + NODE_H + 20} L ${genTopCX},${Y_XFMR + NODE_H + 20} L ${genTopCX},${Y_GEN}`}
        dashed={genIsStandby}
      />

      {/* GEN → UPS input (ATS path, dashed when standby) */}
      <ConnLine
        d={`M ${genTopCX},${genBot} L ${genTopCX},${Y_UPS + NODE_H / 2} L ${CX_SPINE + NODE_W / 2},${Y_UPS + NODE_H / 2}`}
        dashed={genIsStandby}
      />

      {/* UPS → horizontal bus */}
      <ConnLine d={`M ${CX_SPINE},${upsBot} L ${CX_SPINE},${Y_BUS}`} />

      {/* Horizontal bus spanning PDU range */}
      <ConnLine
        d={`M ${pduCenters[0]},${Y_BUS} L ${pduCenters[pduCount - 1]},${Y_BUS}`}
      />

      {/* Bus → each PDU */}
      {pduCenters.map((cx, i) => (
        <ConnLine
          key={`bus-pdu-${i}`}
          d={`M ${cx},${Y_BUS} L ${cx},${Y_PDU}`}
        />
      ))}

      {/* PDU → Hall (left-half PDUs → HALL-A, right-half → HALL-B) */}
      {pduCenters.map((cx, i) => {
        const destCX = i < halfCount ? hallACX : hallBCX;
        return (
          <ConnLine
            key={`pdu-hall-${i}`}
            d={`M ${cx},${pduBot} L ${cx},${Y_HALL + NODE_H / 2} L ${destCX},${Y_HALL + NODE_H / 2} L ${destCX},${Y_HALL}`}
          />
        );
      })}

      {/* ── Nodes ── */}

      {/* GRID */}
      <g
        style={{ ...nodeGlow('GRID', activeFault), cursor: 'pointer' }}
        onMouseEnter={(e) => { const i = getNodeInfo('GRID'); setTip({ x: e.clientX, y: e.clientY, ...i }); }}
        onMouseMove={(e) => { setTip(p => p ? { ...p, x: e.clientX, y: e.clientY } : null); }}
        onMouseLeave={() => setTip(null)}
      >
        <SldNode
          x={nx(CX_SPINE)} y={Y_GRID}
          label="UTILITY GRID"
          sublabel={snapshot ? (snapshot.utility_ok ? 'Supply normal' : 'SUPPLY FAULT') : 'Connecting…'}
          status={utilSt}
        />
      </g>

      {/* TRANSFORMER */}
      <g
        style={{ ...nodeGlow('XFMR', activeFault), cursor: 'pointer' }}
        onMouseEnter={(e) => { const i = getNodeInfo('XFMR'); setTip({ x: e.clientX, y: e.clientY, ...i }); }}
        onMouseMove={(e) => { setTip(p => p ? { ...p, x: e.clientX, y: e.clientY } : null); }}
        onMouseLeave={() => setTip(null)}
      >
        <SldNode
          x={nx(CX_SPINE)} y={Y_XFMR}
          label="MAIN TRANSFORMER"
          sublabel="11kV / 400V"
          status={xfmrSt}
        />
      </g>

      {/* UPS-01 */}
      <g
        style={{ cursor: 'pointer' }}
        onMouseEnter={(e) => { const i = getNodeInfo('UPS-01'); setTip({ x: e.clientX, y: e.clientY, ...i }); }}
        onMouseMove={(e) => { setTip(p => p ? { ...p, x: e.clientX, y: e.clientY } : null); }}
        onMouseLeave={() => setTip(null)}
      >
        <SldNode
          x={nx(CX_SPINE)} y={Y_UPS}
          label="UPS-01"
          sublabel={ups0 ? `${ups0.mode} · ${ups0.battery_pct.toFixed(0)}% SOC` : 'No data'}
          status={upsSt}
        />
      </g>

      {/* GEN-01 */}
      <g
        style={{ ...nodeGlow('GEN-01', activeFault), cursor: 'pointer' }}
        onMouseEnter={(e) => { const i = getNodeInfo('GEN-01'); setTip({ x: e.clientX, y: e.clientY, ...i }); }}
        onMouseMove={(e) => { setTip(p => p ? { ...p, x: e.clientX, y: e.clientY } : null); }}
        onMouseLeave={() => setTip(null)}
      >
        <SldNode
          x={nx(CX_GEN)} y={Y_GEN}
          label="GEN-01"
          sublabel={snapshot?.generator_state ?? 'STANDBY'}
          status={genSt}
        />
      </g>

      {/* PDUs */}
      {pduCenters.map((cx, i) => {
        const pdu = pdus[i];
        const st     = pdu ? pduStatus(pdu.load_pct) : 'standby';
        const nodeId = pdu?.id.toUpperCase() ?? `PDU-${String.fromCharCode(65 + i)}`;
        return (
          <g
            key={`pdu-${i}`}
            style={{ cursor: 'pointer' }}
            onMouseEnter={(e) => { const info = getNodeInfo(nodeId); setTip({ x: e.clientX, y: e.clientY, ...info }); }}
            onMouseMove={(e) => { setTip(p => p ? { ...p, x: e.clientX, y: e.clientY } : null); }}
            onMouseLeave={() => setTip(null)}
          >
            <SldNode
              x={nx(cx)} y={Y_PDU}
              label={nodeId}
              sublabel={pdu ? `${pdu.load_kw.toFixed(1)} kW · ${pdu.load_pct.toFixed(0)}%` : 'No data'}
              status={st}
            />
          </g>
        );
      })}

      {/* HALL-A */}
      <g
        style={{ cursor: 'pointer' }}
        onMouseEnter={(e) => { const i = getNodeInfo('HALL-A'); setTip({ x: e.clientX, y: e.clientY, ...i }); }}
        onMouseMove={(e) => { setTip(p => p ? { ...p, x: e.clientX, y: e.clientY } : null); }}
        onMouseLeave={() => setTip(null)}
      >
        <SldNode
          x={nx(hallACX, HALL_W)} y={Y_HALL}
          w={HALL_W} h={NODE_H}
          label="DATA HALL A"
          sublabel={snapshot ? `${hallAKw.toFixed(0)} kW IT · ${racksA.length} racks` : 'No data'}
          status={hallASt}
        />
      </g>

      {/* HALL-B */}
      <g
        style={{ cursor: 'pointer' }}
        onMouseEnter={(e) => { const i = getNodeInfo('HALL-B'); setTip({ x: e.clientX, y: e.clientY, ...i }); }}
        onMouseMove={(e) => { setTip(p => p ? { ...p, x: e.clientX, y: e.clientY } : null); }}
        onMouseLeave={() => setTip(null)}
      >
        <SldNode
          x={nx(hallBCX, HALL_W)} y={Y_HALL}
          w={HALL_W} h={NODE_H}
          label="DATA HALL B"
          sublabel={snapshot ? `${hallBKw.toFixed(0)} kW IT · ${racksB.length} racks` : 'No data'}
          status={hallBSt}
        />
      </g>

      {/* ── Section label: COOLING ── */}
      <text
        x={CX_GEN + NODE_W / 2 + 12} y={Y_GEN + NODE_H / 2 + 4}
        fontSize={10} fontWeight={700} fill="var(--muted)"
        letterSpacing={1}
        fontFamily="inherit"
      >
        ATS/BYPASS
      </text>

      {/* ── Legend ── */}
      {LEGEND_ITEMS.map(([st, lbl], i) => (
        <g key={st} transform={`translate(${20 + i * 110}, ${VIEW_H - 24})`}>
          <rect x={0} y={0} width={12} height={12} rx={1}
            fill={`${statusColor(st)}18`}
            stroke={statusColor(st)} strokeWidth={1} />
          <text x={17} y={9} fontSize={11} fill="var(--muted)" fontFamily="inherit">
            {lbl}
          </text>
        </g>
      ))}
    </svg>
    {tip && (
      <div style={{
        position: 'fixed', left: tip.x + 14, top: tip.y - 10, zIndex: 1000,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '12px 16px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
        pointerEvents: 'none', minWidth: 180, maxWidth: 220,
      }}>
        <div style={{
          fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8,
          paddingBottom: 8, borderBottom: '1px solid var(--border)',
        }}>
          {tip.title}
        </div>
        {tip.rows.map((r, i) => (
          <div key={i} style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>{r}</div>
        ))}
      </div>
    )}
    </>
  );
}
