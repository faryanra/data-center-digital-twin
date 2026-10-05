'use client';

import { useState } from 'react';
import { useFacilitySocket } from '@/hooks/useFacilitySocket';
import { SLDDiagram } from './SLDDiagram';
import { ModbusPanel } from './ModbusPanel';
import { HallStatusBar } from './HallStatusBar';
import { FireSafetyTab } from './FireSafetyTab';
import { EnvironmentTab } from './EnvironmentTab';
import { AccessControlTab } from './AccessControlTab';
import { SnmpPanel } from './SnmpPanel';

type TabId = 'electrical' | 'fire' | 'environment' | 'access';

const TABS: { id: TabId; label: string }[] = [
  { id: 'electrical',  label: 'Electrical' },
  { id: 'fire',        label: 'Fire & Safety' },
  { id: 'environment', label: 'Environment' },
  { id: 'access',      label: 'Access Control' },
];

export default function FacilityMapPage() {
  const { snapshot } = useFacilitySocket();
  const [activeTab, setActiveTab] = useState<TabId>('electrical');

  const genState = snapshot?.generator_state ?? 'STANDBY';
  const utilityOk = snapshot?.utility_ok !== false;

  const genDot = genState === 'TRANSFERRED' ? '#16A34A'
    : genState === 'STARTING' ? '#D97706'
    : '#6B7280';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── Flat header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 24,
        padding: '16px 0', borderBottom: '1px solid var(--border)',
        marginBottom: 0,
      }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
            Facility Map
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '2px 0 0' }}>
            DC-NORTH-01 · live monitoring
          </p>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* Utility status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <span style={{
              display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
              background: utilityOk ? '#16A34A' : '#DC2626',
            }} />
            <span style={{ color: 'var(--muted)' }}>Utility</span>
            <span style={{ fontWeight: 600, color: utilityOk ? '#16A34A' : '#DC2626' }}>
              {utilityOk ? 'NORMAL' : 'FAULT'}
            </span>
          </div>

          {/* Generator status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <span style={{
              display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
              background: genDot,
            }} />
            <span style={{ color: 'var(--muted)' }}>Generator</span>
            <span style={{ fontWeight: 600, color: genDot }}>{genState}</span>
          </div>

          {/* CRAH count */}
          {snapshot && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <span style={{ color: 'var(--muted)' }}>CRAH</span>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                {snapshot.cooling.crah_online}/{snapshot.cooling.crah_total}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Hall status bar ── */}
      <div style={{ paddingTop: 20, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
        <HallStatusBar snapshot={snapshot} />
      </div>

      {/* ── Tab bar ── */}
      <div style={{
        display: 'flex', borderBottom: '1px solid var(--border)',
        marginBottom: 24,
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '12px 20px', fontSize: 14, fontWeight: 500,
              color: activeTab === tab.id ? 'var(--accent)' : 'var(--muted)',
              background: 'transparent', border: 'none', cursor: 'pointer',
              borderBottom: activeTab === tab.id
                ? '2px solid var(--accent)'
                : '2px solid transparent',
              marginBottom: -1,
              transition: 'color 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {activeTab === 'electrical' && (
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <SLDDiagram snapshot={snapshot} activeFault={null} />
          </div>
          <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <ModbusPanel />
            <SnmpPanel />
          </div>
        </div>
      )}

      {activeTab === 'fire' && (
        <FireSafetyTab data={snapshot?.fire_safety} />
      )}

      {activeTab === 'environment' && (
        <EnvironmentTab
          data={snapshot?.environment}
          setpointC={snapshot?.crah_setpoint_c}
        />
      )}

      {activeTab === 'access' && (
        <AccessControlTab data={snapshot?.access_control} />
      )}
    </div>
  );
}
