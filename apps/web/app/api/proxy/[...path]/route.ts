/**
 * Server-side proxy to the FastAPI backend.
 * Forwards requests from the browser to API_BASE_URL (internal Docker network).
 * Avoids CORS issues and exposes a single origin to the browser.
 *
 * Usage: fetch('/api/proxy/alarms') → backend:8000/alarms
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const BACKEND = process.env.API_BASE_URL ?? 'http://localhost:8000';

// Never cache proxied API responses — live telemetry and alarm counts must be
// fresh on every request (fixes stale "2 vs 12" alarm reads after reload).
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

async function handler(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const backendPath = path.join('/');
  const search = req.nextUrl.search;
  const url = `${BACKEND}/${backendPath}${search}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  // Forward the signed session JWT; FastAPI verifies it with the shared
  // JWT_SECRET, so a caller cannot claim a role by setting headers.
  const token = (await cookies()).get('auth_token')?.value;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  // Attach the machine API key server-side (never exposed to the browser) so
  // api-key-gated endpoints (energy, telemetry, devices, simulation/fault)
  // are reachable through the proxy once API_KEY is set.
  const apiKey = process.env.API_KEY;
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  const body = req.method !== 'GET' && req.method !== 'HEAD'
    ? await req.text()
    : undefined;

  const res = await fetch(url, {
    method: req.method,
    headers,
    body,
    cache: 'no-store',
  });

  const data = await res.text();
  // 204/205/304 must not carry a body — the Response constructor throws
  // "Invalid response status code 204" if one is passed (e.g. fault injection
  // and user-delete endpoints return 204).
  const bodyless = res.status === 204 || res.status === 205 || res.status === 304;
  return new NextResponse(bodyless ? null : data, {
    status: res.status,
    headers: {
      'Content-Type': res.headers.get('Content-Type') ?? 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

export const GET    = handler;
export const POST   = handler;
export const DELETE = handler;
export const PATCH  = handler;
export const PUT    = handler;
