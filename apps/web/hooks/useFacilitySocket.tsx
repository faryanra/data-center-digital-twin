'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import type { WsFacilitySnapshot } from '@dctwin/types';

const WS_URL =
  (process.env.NEXT_PUBLIC_WS_URL as string | undefined) ??
  'ws://localhost:8000/ws/facility';

type ConnectionState = 'connecting' | 'open' | 'closed' | 'error';

interface FacilitySocketValue {
  snapshot: WsFacilitySnapshot | null;
  connState: ConnectionState;
}

const CACHE_MAX = 40;
const STORAGE_KEY = 'dc_snapshot_cache';

// Module-level ring buffer — survives SPA navigation. Seeded from sessionStorage
// so a full browser reload restores the last snapshots instead of starting empty.
let _snapshotCache: WsFacilitySnapshot[] = loadCache();

function loadCache(): WsFacilitySnapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as WsFacilitySnapshot[]) : [];
    return Array.isArray(parsed) ? parsed.slice(-CACHE_MAX) : [];
  } catch {
    return [];
  }
}

function persistCache(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(_snapshotCache));
  } catch {
    // storage unavailable / full — ignore
  }
}

export function getSnapshotCache(): WsFacilitySnapshot[] {
  return [..._snapshotCache];
}

// Last known snapshot — lets a page paint KPIs immediately after reload.
export function getLastSnapshot(): WsFacilitySnapshot | null {
  return _snapshotCache.length ? _snapshotCache[_snapshotCache.length - 1] : null;
}

const FacilitySocketContext = createContext<FacilitySocketValue | null>(null);

/**
 * Owns the single /ws/facility connection for the whole dashboard. Pages read
 * it through useFacilitySocket(), so navigating between pages never opens a
 * second socket.
 */
export function FacilitySocketProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<WsFacilitySnapshot | null>(null);
  const [connState, setConnState] = useState<ConnectionState>('connecting');

  useEffect(() => {
    let disposed = false;
    let attempt = 0;
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const last = getLastSnapshot();
    if (last) setSnapshot(last);

    function open() {
      if (disposed) return;
      ws = new WebSocket(WS_URL);
      setConnState('connecting');

      ws.onopen = () => {
        attempt = 0;
        setConnState('open');
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data as string) as WsFacilitySnapshot;
          _snapshotCache.push(data);
          if (_snapshotCache.length > CACHE_MAX) {
            _snapshotCache.splice(0, _snapshotCache.length - CACHE_MAX);
          }
          persistCache();
          setSnapshot(data);
        } catch {
          // malformed message — ignore
        }
      };

      ws.onerror = () => setConnState('error');

      ws.onclose = () => {
        if (disposed) return;
        setConnState('closed');
        attempt += 1;
        const delay = Math.min(30_000, 2000 * 2 ** Math.min(attempt - 1, 4));
        retryTimer = setTimeout(open, delay);
      };
    }

    open();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (ws) {
        // Detach before closing so this socket cannot schedule a reconnect.
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.close();
      }
    };
  }, []);

  return (
    <FacilitySocketContext.Provider value={{ snapshot, connState }}>
      {children}
    </FacilitySocketContext.Provider>
  );
}

export function useFacilitySocket(): FacilitySocketValue {
  const value = useContext(FacilitySocketContext);
  if (!value) {
    throw new Error('useFacilitySocket must be used inside <FacilitySocketProvider>');
  }
  return value;
}
