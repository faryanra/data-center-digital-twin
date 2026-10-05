# Contributing to Data Center Digital Twin

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 22.x |
| Python | 3.12+ |
| Docker + Compose | 24+ |
| Git | 2.40+ |

## Quick start

```bash
# Frontend only
cd apps/web && npm install && npm run dev

# Full stack
make up          # all services (no sensors)
make up-sensors  # add IoT simulators
make logs        # tail all logs
make down        # stop everything
```

Mock credentials: `admin@datacenter.local` / `admin123` (ADMIN), `operator@datacenter.local` / `op123` (OPERATOR).

## Branch strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready; triggers GHCR Docker publish |
| `dev` | Integration branch; all PRs target `dev` |
| `feat/<name>` | Feature branches off `dev` |
| `fix/<name>` | Bug-fix branches off `dev` |

## Commit style

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(scope): short description
fix(scope): short description
docs(scope): short description
refactor(scope): short description
test(scope): short description
```

Scopes: `api`, `frontend`, `simulation`, `infra`, `phase-N`.

## Running tests

```bash
# Simulation unit + E2E tests
cd simulation
PYTHONPATH=.. pytest tests/ -v

# API integration tests
cd services/api
DATABASE_URL=sqlite+aiosqlite:///./test.db pytest tests/ -v

# Frontend
cd apps/web
npm run typecheck
npm run build
```

## Code standards

- **TypeScript**: strict mode, no `any`. Run `npm run typecheck` before pushing.
- **Python**: `ruff check` for linting (`pip install ruff`).
- **No Redux/Zustand** — React Context only for auth state.
- **No API calls in frontend** — mock data only until Phase 18 wires real endpoints.
- **SenML payload format** preserved in Python simulators — do not change.
- **Modbus register layout** (6 registers: voltage, current, power, energy, power_factor, frequency) — do not change scaling.

## Architecture decisions

Significant technical choices are recorded as ADRs in [`docs/adr/`](docs/adr/). Add a new ADR before implementing a major architectural change.

## Pull request checklist

- [ ] `npm run typecheck` passes (frontend changes)
- [ ] `ruff check services/api` passes (Python changes)
- [ ] All existing tests still pass
- [ ] New behaviour covered by a test
- [ ] README updated if user-facing behaviour changed (see README requirement in `CLAUDE.md`)
- [ ] No `tsconfig.tsbuildinfo` in the commit
