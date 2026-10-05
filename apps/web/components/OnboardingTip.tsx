'use client';

import { useState, useEffect } from 'react';

const TIPS = [
  { id: 'fault', icon: '⚡', text: 'Inject a fault from the Fault Panel to see the SLD highlight the affected node.' },
  { id: 'ws', icon: '🔴', text: 'The green dot top-right means WebSocket is live. Data refreshes every 5 seconds.' },
  { id: 'halls', icon: '🏢', text: 'Hall status cards show real-time power load, temperature, and CRAH unit count.' },
  { id: 'modbus', icon: '🔌', text: 'Modbus panel reads live register values from UPS, PDU, CRAH, and Generator.' },
];

export function OnboardingTip() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem('tips-dismissed') === '1') {
        setDismissed(true);
        return;
      }
    } catch {}
    const t = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    try { localStorage.setItem('tips-dismissed', '1'); } catch {}
    setVisible(false);
    setDismissed(true);
  }

  if (dismissed || !visible) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-50 w-80 rounded border border-[var(--border)] bg-[var(--surface)] shadow-xl p-4 space-y-3"
      style={{ animation: 'slideUp 0.3s ease' }}
    >
      <style>{`@keyframes slideUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }`}</style>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest text-[var(--accent)]">Quick Tips</span>
        <button onClick={dismiss} className="text-[var(--muted)] hover:text-[var(--text)] text-lg leading-none">×</button>
      </div>
      <div className="space-y-2">
        {TIPS.map(tip => (
          <div key={tip.id} className="flex gap-2 text-sm text-[var(--muted)]">
            <span>{tip.icon}</span>
            <span>{tip.text}</span>
          </div>
        ))}
      </div>
      <button
        onClick={dismiss}
        className="w-full rounded-md bg-[var(--accent)] py-1.5 text-xs font-semibold text-white hover:bg-blue-600 transition-colors"
      >
        Got it
      </button>
    </div>
  );
}
