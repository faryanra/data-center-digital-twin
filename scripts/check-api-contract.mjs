#!/usr/bin/env node
/**
 * API contract guard.
 *
 * Fails if the frontend calls an endpoint the FastAPI backend does not expose.
 * This catches the whole class of "dead button / empty chart" bugs that come
 * from the frontend and backend drifting apart.
 *
 * Run locally:   node scripts/check-api-contract.mjs
 * Run in CI:     same command as a job step (exit 1 blocks the build).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const WEB = join(ROOT, 'apps/web');
const API_FILE = join(ROOT, 'services/api/api_service.py');

// ── collect backend routes ───────────────────────────────────────────────────
const apiSrc = readFileSync(API_FILE, 'utf8');
const backend = new Set();
for (const m of apiSrc.matchAll(/@app\.(?:get|post|put|delete|patch|websocket)\("([^"]+)"/g)) {
  backend.add(normalize(m[1].replace(/^\//, '')));
}

// ── collect frontend endpoints ───────────────────────────────────────────────
const files = [];
walk(join(WEB, 'app'));
walk(join(WEB, 'components'));
walk(join(WEB, 'hooks'));
walk(join(WEB, 'lib'));

const calls = []; // { endpoint, file }
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  // a) literal /api/proxy/<path>
  for (const m of src.matchAll(/\/api\/proxy\/([^"'`?\s)]+)/g)) {
    calls.push({ endpoint: normalize(m[1]), file: rel(f) });
  }
  // b) control helper: postControl('<seg>' → control/<seg>
  for (const m of src.matchAll(/postControl\(\s*[`'"]([^`'"]+)[`'"]/g)) {
    calls.push({ endpoint: normalize('control/' + m[1]), file: rel(f) });
  }
}

// ── compare ──────────────────────────────────────────────────────────────────
const misses = [];
const seen = new Set();
for (const c of calls) {
  const key = c.endpoint + '|' + c.file;
  if (seen.has(key)) continue;
  seen.add(key);
  if (c.endpoint.startsWith('../') || c.endpoint === '' || c.endpoint.includes(':id/../')) continue;
  if (!matches(c.endpoint)) misses.push(c);
}

if (misses.length === 0) {
  console.log(`✓ API contract OK — every frontend call maps to a backend route (${seen.size} checked).`);
  process.exit(0);
}

console.error('✗ API contract mismatches — frontend calls with NO matching backend route:\n');
for (const m of misses) console.error(`  • /api/proxy/${m.endpoint}   ←  ${m.file}`);
console.error(`\n${misses.length} dead endpoint(s). Fix the path or add the backend route.`);
process.exit(1);

// ── helpers ──────────────────────────────────────────────────────────────────
function normalize(p) {
  return p
    .replace(/\?.*$/, '')               // drop query string
    .replace(/\$\{[^}]*\}/g, ':id')     // ${x} → :id
    .replace(/\{[^}]*\}/g, ':id')       // {x}  → :id
    .replace(/\/+$/, '');               // trailing slash
}
function matches(ep) {
  if (backend.has(ep)) return true;
  for (const r of backend) {
    // a base/router prefix (e.g. "control") when the backend has "control/*"
    if (r === ep || r.startsWith(ep + '/')) return true;
    // tolerate :id vs concrete segment differences
    if (r.split('/').length !== ep.split('/').length) continue;
    const a = r.split('/'), b = ep.split('/');
    if (a.every((seg, i) => seg === b[i] || seg === ':id' || b[i] === ':id')) return true;
  }
  return false;
}
function walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries) {
    const full = join(dir, e);
    if (e === 'node_modules' || e === '.next' || e === 'dist') continue;
    const s = statSync(full);
    if (s.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(e)) files.push(full);
  }
}
function rel(f) { return f.replace(ROOT + '/', ''); }
