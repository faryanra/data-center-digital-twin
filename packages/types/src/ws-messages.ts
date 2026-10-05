export interface WsRackState {
  id: string;
  load_pct: number;
  inlet_c: number;
  outlet_c: number;
  status: 'ONLINE' | 'WARNING' | 'CRITICAL' | 'OFFLINE';
  kw: number;
}

export interface WsPduState {
  id: string;
  location: string;
  load_kw: number;
  load_pct: number;
  racks: WsRackState[];
}

export interface WsUpsState {
  id: string;
  mode: 'NORMAL' | 'BATTERY' | 'BYPASS' | 'FAULT';
  load_pct: number;
  battery_pct: number;
  input_ok: boolean;
}

export interface WsHallState {
  id: string;
  name: string;
  total_kw: number;
  capacity_kw: number;
  avg_inlet_c: number;
  crah_online: number;
  crah_units: number;
  crah_total: number;
  rack_count: number;
}

export interface WsFacilitySnapshot {
  ts: number;
  pue: number;
  it_load_kw: number;
  total_power_kw: number;
  utility_ok: boolean;
  generator_state: 'STANDBY' | 'STARTING' | 'TRANSFERRED' | 'RECOVERY';
  generator_fuel_pct: number;
  per_hall_cooling_kw: Record<string, number>;
  ups: WsUpsState[];
  cooling: {
    supply_temp_c: number;
    return_temp_c: number;
    crah_online: number;
    crah_total: number;
    cop: number;
    cooling_power_kw: number;
  };
  pdus: WsPduState[];
  racks: WsRackState[];
  alarms: { active_count: number; critical_count: number };
  halls?: WsHallState[];
  fire_safety?: WsFireSafety;
  access_control?: WsAccessControl;
  environment?: WsEnvironment;
  power_distribution?: WsPowerDistribution;
  crah_setpoint_c?: number;
  ups_bypass_enabled?: boolean;
  gen_auto_start?: boolean;
}

export interface WsFireZone {
  id: string;
  name: string;
  status: 'NORMAL' | 'ALARM' | 'SUPPRESSING';
  smoke_ppm: number;
  heat_c: number;
  suppression_agent_pct: number;
}

export interface WsFireSafety {
  zones: WsFireZone[];
  system_armed: boolean;
  last_alarm_zone: string | null;
}

export interface WsDoor {
  id: string;
  location: string;
  locked: boolean;
  badge_required: boolean;
  last_event: string | null;
}

export interface WsAccessControl {
  doors: WsDoor[];
  intrusion_detected: boolean;
}

export interface WsEnvZone {
  id: string;
  location: string;
  temp_c: number;
  humidity_pct: number;
  airflow_mps: number;
  status: 'NORMAL' | 'WARNING' | 'CRITICAL';
}

export interface WsEnvironment {
  zones: WsEnvZone[];
}

export interface WsBranchCircuit {
  id: string;
  label: string;
  phase: string;
  amps: number;
  volts: number;
  breaker_on: boolean;
}

export interface WsPowerDistribution {
  bus_voltage_v: number;
  bus_frequency_hz: number;
  branches: WsBranchCircuit[];
}

export interface AlarmRow {
  id: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  source: string;
  message: string;
  state: 'ACTIVE' | 'ACKNOWLEDGED';
  raised_at: number;
  acked_by: string | null;
  acked_at: number | null;
}

export type WsMessage = { type: 'snapshot'; data: WsFacilitySnapshot };
