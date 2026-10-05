// ─── Enums ────────────────────────────────────────────────────────────────────

export type AlarmSeverity = 'OK' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
export type EquipmentStatus = 'ONLINE' | 'OFFLINE' | 'STANDBY' | 'WARNING' | 'FAULT' | 'MAINTENANCE';
export type UserRole = 'ADMIN' | 'OPERATOR';

// ─── Physical model ───────────────────────────────────────────────────────────

export interface Sensor {
  id: string;
  type: string;
  unit: string;
  value: number;
  timestamp: string;
}

export interface Equipment {
  id: string;
  name: string;
  type: string;
  status: EquipmentStatus;
  sensors: Sensor[];
}

export interface Room {
  id: string;
  name: string;
  equipmentIds: string[];
}

export interface Floor {
  id: string;
  name: string;
  rooms: Room[];
}

export interface Building {
  id: string;
  floors: Floor[];
}

export interface Site {
  id: string;
  name: string;
  location: string;
}

export interface Facility {
  site: Site;
  building: Building;
}

// ─── Runtime state ────────────────────────────────────────────────────────────

export interface EquipmentRuntime {
  id: string;
  name: string;
  type: string;
  status: EquipmentStatus;
  metrics: Record<string, number | string>;
}

export interface RackRuntime extends EquipmentRuntime {
  type: 'RACK';
  metrics: {
    powerKw: number;
    inletTempC: number;
    outletTempC?: number;
  };
}

export interface UpsRuntime extends EquipmentRuntime {
  type: 'UPS';
  metrics: {
    inputVoltageV: number;
    outputVoltageV: number;
    loadPct: number;
    batterySocPct: number;
  };
}

export interface GeneratorRuntime extends EquipmentRuntime {
  type: 'GENERATOR';
  metrics: {
    fuelLevelPct: number;
  };
}

export interface CrahRuntime extends EquipmentRuntime {
  type: 'CRAH';
  metrics: {
    supplyTempC: number;
    returnTempC: number;
    fanSpeedPct?: number;
  };
}

export interface FacilityTotals {
  totalPowerKw: number;
  itLoadKw: number;
  coolingKw: number;
  otherKw: number;
  pue: number;
  upsBatterySocPct: number;
}

export interface ActiveAlarm {
  id: string;
  severity: AlarmSeverity;
  equipmentId: string;
  location: string;
  description: string;
  timestamp: string;
}

export interface FacilityRuntimeState {
  totals: FacilityTotals;
  equipment: EquipmentRuntime[];
  alarms: ActiveAlarm[];
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  role: UserRole;
  email: string;
}

export interface UserWithPassword extends User {
  password: string;
}

// ─── Chart data ───────────────────────────────────────────────────────────────

export interface PowerHistoryPoint {
  hour: string;
  itLoad: number;
  cooling: number;
  other: number;
}
