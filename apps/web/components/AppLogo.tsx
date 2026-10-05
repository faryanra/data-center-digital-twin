export function AppLogo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img
        src="/icons/brand-icon.svg"
        alt="DC Twin"
        style={{ width: 32, height: 32, borderRadius: 6, flexShrink: 0 }}
      />
      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
            DC-NORTH-01
          </span>
          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)', marginTop: 2 }}>
            Digital Twin
          </span>
        </div>
      )}
    </div>
  );
}
