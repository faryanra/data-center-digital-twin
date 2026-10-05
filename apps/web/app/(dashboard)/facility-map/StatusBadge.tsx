type Status = string;

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  OK:         { bg: 'rgba(22,163,74,0.1)',    text: '#16A34A', label: 'OK' },
  NORMAL:     { bg: 'rgba(22,163,74,0.1)',    text: '#16A34A', label: 'NORMAL' },
  WARNING:    { bg: 'rgba(217,119,6,0.1)',    text: '#D97706', label: 'WARNING' },
  ALARM:      { bg: 'rgba(220,38,38,0.1)',    text: '#DC2626', label: 'ALARM' },
  CRITICAL:   { bg: 'rgba(220,38,38,0.1)',    text: '#DC2626', label: 'CRITICAL' },
  FAULT:      { bg: 'rgba(220,38,38,0.1)',    text: '#DC2626', label: 'FAULT' },
  ARMED:      { bg: 'rgba(22,163,74,0.1)',    text: '#16A34A', label: 'ARMED' },
  DISARMED:   { bg: 'rgba(220,38,38,0.1)',    text: '#DC2626', label: 'DISARMED' },
  STANDBY:    { bg: 'rgba(107,114,128,0.1)',  text: '#6B7280', label: 'STANDBY' },
  LOCKED:     { bg: 'rgba(22,163,74,0.1)',    text: '#16A34A', label: 'LOCKED' },
  UNLOCKED:   { bg: 'rgba(217,119,6,0.1)',    text: '#D97706', label: 'UNLOCKED' },
  OPEN:       { bg: 'rgba(37,99,235,0.1)',    text: '#2563EB', label: 'OPEN' },
  FORCED:     { bg: 'rgba(220,38,38,0.1)',    text: '#DC2626', label: 'FORCED OPEN' },
  SUPPRESSING: { bg: 'rgba(217,119,6,0.1)',   text: '#D97706', label: 'SUPPRESSING' },
};

export function StatusBadge({ status }: { status: Status }) {
  const cfg = STATUS_CONFIG[status?.toUpperCase()] ?? STATUS_CONFIG['STANDBY'];
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 2,
      background: cfg.bg, color: cfg.text,
      textTransform: 'uppercase', letterSpacing: '0.04em',
      display: 'inline-block',
    }}>
      {cfg.label}
    </span>
  );
}
