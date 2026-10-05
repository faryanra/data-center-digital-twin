export const SENSOR_TYPES = [
  { id: 'temp_rack_inlet',   label: 'Rack Inlet Temperature',  unit: '°C', category: 'Temperature', icon: '🌡', thresholdWarn: 28, thresholdCrit: 32, protocol: 'SNMP/Modbus' },
  { id: 'temp_rack_outlet',  label: 'Rack Outlet Temperature', unit: '°C', category: 'Temperature', icon: '🌡', thresholdWarn: 40, thresholdCrit: 45, protocol: 'SNMP/Modbus' },
  { id: 'temp_ambient',      label: 'Ambient Temperature',     unit: '°C', category: 'Temperature', icon: '🌡', thresholdWarn: 27, thresholdCrit: 35, protocol: 'SNMP/Modbus' },
  { id: 'humidity',          label: 'Relative Humidity',       unit: '%',  category: 'Environment', icon: '💧', thresholdWarn: 65, thresholdCrit: 75, protocol: 'SNMP/Modbus' },
  { id: 'power_kw',          label: 'Power Draw (kW)',         unit: 'kW', category: 'Electrical',  icon: '⚡', thresholdWarn: 0,  thresholdCrit: 0,  protocol: 'Modbus' },
  { id: 'current_a',         label: 'Phase Current (A)',       unit: 'A',  category: 'Electrical',  icon: '⚡', thresholdWarn: 0,  thresholdCrit: 0,  protocol: 'Modbus' },
  { id: 'voltage_v',         label: 'Voltage (V)',             unit: 'V',  category: 'Electrical',  icon: '⚡', thresholdWarn: 0,  thresholdCrit: 0,  protocol: 'Modbus' },
  { id: 'airflow_cfm',       label: 'Airflow (CFM)',           unit: 'CFM',category: 'Cooling',     icon: '❄', thresholdWarn: 0,  thresholdCrit: 0,  protocol: 'SNMP' },
  { id: 'smoke',             label: 'Smoke Detector',          unit: '',   category: 'Safety',      icon: '🔥', thresholdWarn: 0,  thresholdCrit: 1,  protocol: 'Digital I/O' },
  { id: 'water_leak',        label: 'Water Leak Detector',     unit: '',   category: 'Safety',      icon: '💧', thresholdWarn: 0,  thresholdCrit: 1,  protocol: 'Digital I/O' },
  { id: 'door_contact',      label: 'Door Contact',            unit: '',   category: 'Access',      icon: '🚪', thresholdWarn: 0,  thresholdCrit: 0,  protocol: 'Digital I/O' },
  { id: 'ups_battery_pct',   label: 'UPS Battery (%)',         unit: '%',  category: 'Power',       icon: '🔋', thresholdWarn: 30, thresholdCrit: 10, protocol: 'SNMP' },
] as const;

export const PREDEFINED_LOCATIONS = [
  'Hall A — Row 1', 'Hall A — Row 2', 'Hall A — Row 3',
  'Hall A — Row 4', 'Hall A — Row 5',
  'Hall B — Row 1', 'Hall B — Row 2', 'Hall B — Row 3',
  'Hall B — Row 4', 'Hall B — Row 5',
  'CRAH-01', 'CRAH-02', 'CRAH-03', 'CRAH-04',
  'UPS-01', 'Generator Room', 'MV Switchroom',
  'PDU-A', 'PDU-B', 'PDU-C', 'PDU-D',
  'Corridor — North', 'Corridor — South',
  'Server Room — Rack A01', 'Server Room — Rack A02', 'Server Room — Rack B01',
] as const;
