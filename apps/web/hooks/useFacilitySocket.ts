'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { WsFacilitySnapshot } from '@dctwin/types';

const WS_URL =
  (process.env.NEXT_PUBLIC_WS_URL as string | undefined) ??
  'ws://localhost:8000/ws/facility';

type ConnectionState = 'connecting' | 'open' | 'closed' | 'error';

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

export function useFacilitySocket() {
  const [snapshot, setSnapshot] = useState<WsFacilitySnapshot | null>(null);
  const [connState, setConnState] = useState<ConnectionState>('connecting');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    setConnState('connecting');

    ws.onopen = () => {
      attemptRef.current = 0;
      setConnState('open');
    };

    ws.onmessage = (ev) => {
      try {
        const data: WsFacilitySnapshot = JSON.parse(ev.data as string);
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
      setConnState('closed');
      attemptRef.current += 1;
      const delay = Math.min(30_000, 2000 * 2 ** Math.min(attemptRef.current - 1, 4));
      reconnectRef.current = setTimeout(connect, delay);
    };
  }, []);

  useEffect(() => {
    // Restore last snapshot from cache immediately (survives reload), then connect.
    const last = getLastSnapshot();
    if (last) setSnapshot(last);
    connect();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { snapshot, connState };
}
