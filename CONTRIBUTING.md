# Contributing to the DC-NORTH-01 Digital Twin

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 22.x |
| Python | 3.13 |
| Docker + Compose | 24+ (optional — only for the full stack) |
| Git | 2.40+ |

## Quick start

```bash
# Backend (simulator, REST, WebSocket) — falls back to SQLite without PostgreSQL
cd services/api
python -m venv .venv && source .venv/bin/activate    # Windows: .venv\Scripts\Activate.ps1
pip install -r ../../requirements-dev.txt
uvicorn api_service:app --reload --port 8000

# Frontend
cd apps/web
cp .env.local.example .env.local
npm install
npm run dev                                            # http://localhost:3000

# Or the whole stack (API, frontend, PostgreSQL, Prometheus, Grafana)
cp .env.example .env
make up            # docker compose up -d
make logs
make down
```

Demo sign-in: `admin@datacenter.local` / `admin123` (ADMIN) and
`operator@datacenter.local` / `operator123` (OPERATOR).

## Branches and commits

Branch off `main` (`feat/<name>`, `fix/<name>`) and open a pull request into `main`;
CI must be green before merging.

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(web): short description
fix(api): short description
```

Common scopes: `web`, `api`, `sim`, `alarms`, `infra`, `docs`.

## Running the checks CI runs

```bash
# Python lint (CI lints services/api)
ruff check services/api

# Unit + simulation tests
PYTHONPATH=.:services/api python -m pytest tests/ simulation/tests/

# API integration tests (auth, alarms, faults, users, Modbus)
cd services/api
PYTHONPATH=../..:. DATABASE_URL=sqlite+aiosqlite:///./test_dc.db python -m pytest tests/

# Frontend
cd apps/web
npm run typecheck
npm run build

# Browser end-to-end tests (local only — needs the backend and frontend running)
npm run test:e2e
```

## Ground rules

- **TypeScript**: strict mode, no `any`. Shared WebSocket/REST shapes live in
  `packages/types/src` — change them together with the Python serializer in
  `services/api/api_service.py`.
- **State**: React Context only (auth, the shared facility WebSocket). No Redux/Zustand.
  Pages read live data with `useFacilitySocket()`; never open another socket.
- **Auth**: FastAPI identifies callers only from the session JWT that the Next.js proxy
  forwards (`Authorization: Bearer`). Never trust role or user headers. New endpoints that
  change state must depend on `require_operator` or `require_admin`.
- **Thresholds**: alarm limits live in `alarm_evaluator.THRESHOLDS` (served by
  `GET /thresholds`). Hall status and the UI read from there — don't hard-code limits.
- **Faults**: injected faults are shared by every viewer, so they must always expire
  (`MAX_FAULT_DURATION_S`).
- **Modbus**: the register map is documented in `services/api/modbus_gateway.py`; update the
  README table when it changes.
- **Sensor simulators** in `services/simulation` keep the SenML payload format.

## Architecture decisions

Significant choices are recorded as ADRs in [`docs/adr/`](docs/adr/). Add one before making a
major architectural change.

## Pull request checklist

- [ ] `ruff check services/api` passes
- [ ] Python and integration tests pass
- [ ] `npm run typecheck` and `npm run build` pass (frontend changes)
- [ ] New behaviour is covered by a test
- [ ] README / `deploy/DEPLOY.md` updated if user-facing behaviour or configuration changed
- [ ] No secrets, `.env` files or `tsconfig.tsbuildinfo` in the commit
