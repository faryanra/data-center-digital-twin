'use client';

import { useEffect } from 'react';

export function PwaInit() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    } else {
      // Dev chunks are not content-hashed; a cached worker would serve stale code.
      void navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())));
    }
  }, []);
  return null;
}
