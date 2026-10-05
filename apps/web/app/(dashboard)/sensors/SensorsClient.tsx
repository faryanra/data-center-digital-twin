'use client';

import { useEffect, useRef, useState } from 'react';
import { useFacilitySocket } from '@/hooks/useFacilitySocket';
import { StatusBadge } from '../facility-map/StatusBadge';
import { Skeleton, TableRowSkeleton } from '@/components/Skeleton';
import { SENSOR_TYPES, PREDEFINED_LOCATIONS } from './sensorLibrary';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Sensor {
  id: string;
  typeId: string;
  name: string;
  location: string;
  value: number | null;
  unit: string;
  status: 'OK' | 'WARNING' | 'CRITICAL' | 'OFFLINE';
  thresholdWarn: number;
  thresholdCrit: number;
  protocol: string;
  lastSeen: string | null;
}

interface AddForm {
  typeId: string;
  name: string;
  location: string;
  thresholdWarn: number;
  thresholdCrit: number;
}

interface EditForm {
  name: string;
  location: string;
  thresholdWarn: number;
  thresholdCrit: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeStatus(
  value: number,
  warn: number,
  crit: number,
  lowerIsBad = false,
): Sensor['status'] {
  if (crit === 0 && warn === 0) return 'OK';
  if (lowerIsBad) {
    if (value <= crit) return 'CRITICAL';
    if (value <= warn) return 'WARNING';
    return 'OK';
  }
  if (crit > 0 && value >= crit) return 'CRITICAL';
  if (warn > 0 && value >= warn) return 'WARNING';
  return 'OK';
}

const CATEGORIES = ['All', 'Temperature', 'Electrical', 'Cooling', 'Safety', 'Access', 'Power', 'Environment'];

const INPUT_STYLE = {
  width: '100%', padding: '8px 10px', borderRadius: 2,
  border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' as const,
};

const LABEL_STYLE = {
  fontSize: 13, fontWeight: 500 as const, color: 'var(--muted)',
  display: 'block' as const, marginBottom: 4,
};

// ── Component ─────────────────────────────────────────────────────────────────

export function SensorsClient() {
  const { snapshot } = useFacilitySocket();
  const seededRef = useRef(false);
  const [seeded, setSeeded] = useState(false);

  const [sensors, setSensors]               = useState<Sensor[]>([]);
  const [editingId, setEditingId]           = useState<string | null>(null);
  const [editForm, setEditForm]             = useState<EditForm>({ name: '', location: '', thresholdWarn: 0, thresholdCrit: 0 });
  const [showAddModal, setShowAddModal]     = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [addForm, setAddForm]               = useState<AddForm>({ typeId: '', name: '', location: '', thresholdWarn: 0, thresholdCrit: 0 });

  // Seed sensors from first snapshot
  useEffect(() => {
    if (!snapshot || seededRef.current) return;
    seededRef.current = true;
    const now = new Date().toISOString();
    const seededList: Sensor[] = [];

    // Rack inlet temperatures (first 4 racks)
    const inletDef = SENSOR_TYPES.find(t => t.id === 'temp_rack_inlet')!;
    snapshot.racks.slice(0, 4).forEach((rack, i) => {
      seededList.push({
        id: crypto.randomUUID(),
        typeId: 'temp_rack_inlet',
        name: `Rack Inlet — Row ${i + 1}`,
        location: `Hall A — Row ${i + 1}`,
        value: rack.inlet_c,
        unit: inletDef.unit,
        status: computeStatus(rack.inlet_c, inletDef.thresholdWarn, inletDef.thresholdCrit),
        thresholdWarn: inletDef.thresholdWarn,
        thresholdCrit: inletDef.thresholdCrit,
        protocol: inletDef.protocol,
        lastSeen: now,
      });
    });

    // UPS battery
    if (snapshot.ups[0]) {
      const batDef = SENSOR_TYPES.find(t => t.id === 'ups_battery_pct')!;
      seededList.push({
        id: crypto.randomUUID(),
        typeId: 'ups_battery_pct',
        name: 'UPS-01 Battery',
        location: 'UPS-01',
        value: snapshot.ups[0].battery_pct,
        unit: batDef.unit,
        status: computeStatus(snapshot.ups[0].battery_pct, batDef.thresholdWarn, batDef.thresholdCrit, true),
        thresholdWarn: batDef.thresholdWarn,
        thresholdCrit: batDef.thresholdCrit,
        protocol: batDef.protocol,
        lastSeen: now,
      });
    }

    // CRAH airflow sensors (no live data — OFFLINE)
    const airDef = SENSOR_TYPES.find(t => t.id === 'airflow_cfm')!;
    ['CRAH-01', 'CRAH-02'].forEach(loc => {
      seededList.push({
        id: crypto.randomUUID(),
        typeId: 'airflow_cfm',
        name: `${loc} Airflow`,
        location: loc,
        value: null,
        unit: airDef.unit,
        status: 'OFFLINE',
        thresholdWarn: airDef.thresholdWarn,
        thresholdCrit: airDef.thresholdCrit,
        protocol: airDef.protocol,
        lastSeen: null,
      });
    });

    setSensors(seededList);
    setSeeded(true);
  }, [snapshot]);

  // ── Derived state ──────────────────────────────────────────────────────────

  const onlineSensors    = sensors.filter(s => s.status !== 'OFFLINE').length;
  const filteredSensors  = filterCategory === 'All'
    ? sensors
    : sensors.filter(s => {
        const def = SENSOR_TYPES.find(t => t.id === s.typeId);
        return def?.category === filterCategory;
      });

  // ── Actions ────────────────────────────────────────────────────────────────

  function deleteSensor(id: string) {
    setSensors(prev => prev.filter(s => s.id !== id));
  }

  function startEdit(s: Sensor) {
    setEditingId(s.id);
    setEditForm({ name: s.name, location: s.location, thresholdWarn: s.thresholdWarn, thresholdCrit: s.thresholdCrit });
  }

  function saveEdit(id: string) {
    setSensors(prev => prev.map(s => {
      if (s.id !== id) return s;
      const newStatus = s.value !== null
        ? computeStatus(s.value, editForm.thresholdWarn, editForm.thresholdCrit, s.typeId === 'ups_battery_pct')
        : s.status;
      return { ...s, ...editForm, status: newStatus };
    }));
    setEditingId(null);
  }

  function updateAddFormTypeId(typeId: string) {
    const def = SENSOR_TYPES.find(t => t.id === typeId);
    setAddForm(f => ({
      ...f, typeId,
      thresholdWarn: def?.thresholdWarn ?? 0,
      thresholdCrit: def?.thresholdCrit ?? 0,
    }));
  }

  function addSensor() {
    if (!addForm.typeId || !addForm.name) return;
    const def = SENSOR_TYPES.find(t => t.id === addForm.typeId);
    const now  = new Date().toISOString();
    const sensor: Sensor = {
      id:            crypto.randomUUID(),
      typeId:        addForm.typeId,
      name:          addForm.name,
      location:      addForm.location,
      value:         null,
      unit:          def?.unit ?? '',
      status:        'OFFLINE',
      thresholdWarn: addForm.thresholdWarn,
      thresholdCrit: addForm.thresholdCrit,
      protocol:      def?.protocol ?? '',
      lastSeen:      now,
    };
    setSensors(prev => [...prev, sensor]);
    setAddForm({ typeId: '', name: '', location: '', thresholdWarn: 0, thresholdCrit: 0 });
    setShowAddModal(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Sensors</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>
            {seeded ? `${sensors.length} configured · ${onlineSensors} online` : 'Loading…'}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            padding: '8px 16px', borderRadius: 2, background: 'var(--accent)', color: '#fff',
            border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}
        >
          + Add Sensor
        </button>
      </div>

      {/* Skeleton while not seeded */}
      {!seeded && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {[80, 60, 90, 70, 80].map((w, i) => (
              <Skeleton key={i} width={w} height={32} style={{ borderRadius: 8 }} />
            ))}
          </div>
          <div className="table-card">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Name', 'Location', 'Type', 'Value', 'Status'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left' }}>
                      <Skeleton width={60} height={11} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <TableRowSkeleton key={i} cols={7} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Main content (shown once seeded) */}
      {seeded && (
      <div>
      {/* Category filter pills */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500,
              border: `1px solid ${filterCategory === cat ? 'var(--accent)' : 'var(--border)'}`,
              background: filterCategory === cat ? 'rgba(37,99,235,0.08)' : 'transparent',
              color: filterCategory === cat ? 'var(--accent)' : 'var(--muted)',
              cursor: 'pointer',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Sensor table */}
      {filteredSensors.length === 0 ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
          {sensors.length === 0 ? 'No sensors configured. Click "+ Add Sensor" to get started.' : `No sensors in category "${filterCategory}".`}
        </div>
      ) : (
        <div className="table-card">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Name', 'Location', 'Type', 'Value', 'Protocol', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{
                    padding: '8px 12px', textAlign: 'left', fontSize: 11,
                    fontWeight: 600, color: 'var(--muted)',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    background: 'var(--surface)',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredSensors.map((s, idx) => {
                const isEditing = editingId === s.id;
                const typeDef   = SENSOR_TYPES.find(t => t.id === s.typeId);
                return isEditing ? (
                  <tr key={s.id} style={{ borderBottom: idx < filteredSensors.length - 1 ? '1px solid var(--border)' : 'none', background: 'rgba(37,99,235,0.03)' }}>
                    <td style={{ padding: '8px 12px' }}>
                      <input
                        value={editForm.name}
                        onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                        style={{ ...INPUT_STYLE, width: 160 }}
                      />
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <input
                        list="location-list"
                        value={editForm.location}
                        onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))}
                        style={{ ...INPUT_STYLE, width: 160 }}
                      />
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--muted)', fontSize: 13 }}>
                      {typeDef?.label ?? s.typeId}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          type="number"
                          value={editForm.thresholdWarn}
                          onChange={e => setEditForm(f => ({ ...f, thresholdWarn: +e.target.value }))}
                          style={{ ...INPUT_STYLE, width: 70 }}
                          title="Warn threshold"
                        />
                        <input
                          type="number"
                          value={editForm.thresholdCrit}
                          onChange={e => setEditForm(f => ({ ...f, thresholdCrit: +e.target.value }))}
                          style={{ ...INPUT_STYLE, width: 70 }}
                          title="Crit threshold"
                        />
                      </div>
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{s.protocol}</td>
                    <td style={{ padding: '8px 12px' }}><StatusBadge status={s.status} /></td>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => saveEdit(s.id)}
                          style={{
                            padding: '5px 10px', fontSize: 12, borderRadius: 2,
                            border: '1px solid var(--accent)', background: 'rgba(37,99,235,0.08)',
                            color: 'var(--accent)', cursor: 'pointer',
                          }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          style={{
                            padding: '5px 10px', fontSize: 12, borderRadius: 2,
                            border: '1px solid var(--border)', background: 'transparent',
                            color: 'var(--muted)', cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={s.id} style={{ borderBottom: idx < filteredSensors.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 500, color: 'var(--text)' }}>{s.name}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{s.location}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>
                      {typeDef?.label ?? s.typeId}
                    </td>
                    <td style={{
                      padding: '10px 12px', fontVariantNumeric: 'tabular-nums',
                      color: s.status === 'CRITICAL' ? '#DC2626' : s.status === 'WARNING' ? '#D97706' : 'var(--text)',
                    }}>
                      {s.value !== null ? `${s.value.toFixed(1)} ${s.unit}` : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{s.protocol}</td>
                    <td style={{ padding: '10px 12px' }}><StatusBadge status={s.status} /></td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => startEdit(s)}
                          style={{
                            padding: '5px 10px', fontSize: 12, borderRadius: 2,
                            border: '1px solid var(--border)', background: 'transparent',
                            color: 'var(--text)', cursor: 'pointer',
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteSensor(s.id)}
                          style={{
                            padding: '5px 10px', fontSize: 12, borderRadius: 2,
                            border: '1px solid rgba(220,38,38,0.4)',
                            background: 'rgba(220,38,38,0.05)', color: '#DC2626', cursor: 'pointer',
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Shared datalist for location autocomplete */}
      <datalist id="location-list">
        {PREDEFINED_LOCATIONS.map(loc => <option key={loc} value={loc} />)}
      </datalist>

      {/* Add Sensor Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 480, background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 4, padding: 24,
          }}>
            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Add Sensor</h2>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--muted)', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {/* Sensor type */}
            <label style={LABEL_STYLE}>Sensor Type</label>
            <select
              value={addForm.typeId}
              onChange={e => updateAddFormTypeId(e.target.value)}
              style={{ ...INPUT_STYLE, marginBottom: 14 }}
            >
              <option value="">Select type…</option>
              {SENSOR_TYPES.map(t => (
                <option key={t.id} value={t.id}>
                  {t.icon} {t.label} ({t.unit || 'binary'}) — {t.protocol}
                </option>
              ))}
            </select>

            {/* Name */}
            <label style={LABEL_STYLE}>Name</label>
            <input
              value={addForm.name}
              onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Rack A01 Inlet"
              style={{ ...INPUT_STYLE, marginBottom: 14 }}
            />

            {/* Location */}
            <label style={LABEL_STYLE}>Location</label>
            <input
              list="location-list"
              value={addForm.location}
              onChange={e => setAddForm(f => ({ ...f, location: e.target.value }))}
              placeholder="Select or type location…"
              style={{ ...INPUT_STYLE, marginBottom: 14 }}
            />

            {/* Thresholds */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={LABEL_STYLE}>Warn Threshold</label>
                <input
                  type="number"
                  value={addForm.thresholdWarn}
                  onChange={e => setAddForm(f => ({ ...f, thresholdWarn: +e.target.value }))}
                  style={INPUT_STYLE}
                />
              </div>
              <div>
                <label style={LABEL_STYLE}>Critical Threshold</label>
                <input
                  type="number"
                  value={addForm.thresholdCrit}
                  onChange={e => setAddForm(f => ({ ...f, thresholdCrit: +e.target.value }))}
                  style={INPUT_STYLE}
                />
              </div>
            </div>

            {/* Submit */}
            <button
              onClick={addSensor}
              disabled={!addForm.typeId || !addForm.name}
              style={{
                width: '100%', padding: 10, borderRadius: 2, background: 'var(--accent)',
                color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                opacity: !addForm.typeId || !addForm.name ? 0.5 : 1,
              }}
            >
              Add Sensor
            </button>
          </div>
        </div>
      )}
      </div>
      )}
    </div>
  );
}
