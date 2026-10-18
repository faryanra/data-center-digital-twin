# DC-NORTH-01 — Data Center Digital Twin

[![CI](https://github.com/faryanra/data-center-digital-twin/actions/workflows/ci.yml/badge.svg)](https://github.com/faryanra/data-center-digital-twin/actions/workflows/ci.yml)

A real-time simulation and monitoring platform for a Tier-III data centre, built to demonstrate how digital-twin technology can support operations without requiring physical hardware.

| Dashboard overview | Energy analytics |
|---|---|
| ![Dashboard](docs/screenshots/01-dashboard.png) | ![Energy](docs/screenshots/02-energy.png) |

| Equipment inventory | Electrical topology |
|---|---|
| ![Equipment](docs/screenshots/03-equipment.png) | ![Topology](docs/screenshots/04-topology.png) |

## What It Monitors

Every 5 seconds a physics-based simulation engine (`FacilitySimulator`) computes a `FacilitySnapshot` — power usage, cooling efficiency, PUE, generator state, per-hall temperatures, and active alarms — and broadcasts it over WebSocket to all connected dashboards simultaneously.

The same snapshot updates Modbus TCP holding registers on port 5020 (local/Docker), so any standard SCADA tool can read live values without custom integration.

**Facility model:** two data halls (Hall A: 10 racks, Hall B: 8 racks, 10 kW each), one 800 kVA UPS, two PDUs, four CRAH units, and a diesel generator with ATS.

## Architecture

### System Architecture

```mermaid
flowchart TD
    Browser["Browser (PWA)"] --> Next["Next.js 16 · App Router :3000"]
    Next --> Proxy["/api/proxy/[...path]"]
    Proxy --> FastAPI["FastAPI :8000"]

    FastAPI --> WS["WebSocket /ws/facility\n5-second tick"]
    FastAPI --> Modbus["Modbus TCP :5020\n4 slaves (local/Docker)"]
    FastAPI --> PG["PostgreSQL / SQLite\nalarm history"]
    FastAPI --> Prom["/metrics\nPrometheus + Grafana"]

    subgraph Simulator
        WS --> Sim["FacilitySimulator\ntick() every 5 s"]
        Sim --> Snap["FacilitySnapshot\ntyped dataclass"]
        Snap --> WS
        Snap --> Modbus
    end
```

### Simulation State Machine

```mermaid
stateDiagram-v2
    [*] --> NORMAL : startup

    state UPS {
        NORMAL --> BATTERY : mains loss (generator not yet carrying load)
        BATTERY --> NORMAL : generator transferred / mains restored
        NORMAL --> BYPASS  : maintenance bypass on
        BYPASS --> NORMAL  : bypass off
    }

    state Generator {
        STANDBY --> STARTING    : ATS triggers (mains lost, auto-start armed)
        STARTING --> TRANSFERRED : engine ready (5 s)
        TRANSFERRED --> RECOVERY : mains restored
        RECOVERY --> STANDBY    : cooldown complete
        STANDBY --> FAULT       : start failure
    }
```

### Auth Flow

```mermaid
sequenceDiagram
    participant Browser
    participant Next as Next.js (server action + proxy)
    participant FastAPI

    Browser->>Next: POST /login {email, password}
    Note over Next: check demo accounts (mock-auth.ts)<br/>sign JWT HS256 with JWT_SECRET (8 h)
    Next-->>Browser: Set-Cookie: auth_token (httpOnly)

    Browser->>Next: GET /dashboard
    Note over Next: proxy.ts verifies the cookie locally
    Next-->>Browser: page

    Browser->>Next: POST /api/proxy/control/…
    Next->>FastAPI: Authorization: Bearer <same JWT>
    Note over FastAPI: verify signature with JWT_SECRET<br/>role from the token, never from headers
    FastAPI-->>Next: 200 / 401 / 403
    Next-->>Browser: response
```

FastAPI and Next.js share `JWT_SECRET`; a request without a valid token gets 401, and one with the wrong role gets 403.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript |
| Charts | Recharts — real-time area/bar charts |
| Backend | FastAPI, Python 3.13, async |
| Auth | JWT HS256 — signed by Next.js (jose), verified by FastAPI (PyJWT); `httpOnly` cookie |
| Simulation | Pure Python dataclass — replaceable interface |
| Database | PostgreSQL 16 (SQLite fallback), SQLAlchemy async — alarm history |
| Industrial | Modbus TCP :5020, pymodbus 3.7 — 4 slaves (map below) |
| Messaging | Mosquitto MQTT :1883 (optional snapshot publish) |
| Observability | Prometheus + Grafana — facility dashboard on `dc_*` metrics |
| Infra | Docker Compose; Render + Neon + Vercel; EC2 Terraform reference (untested) |
| PWA | Web App Manifest — installable on desktop and mobile |

## Key Features

- **Real-time telemetry**: WebSocket at 5-second tick, rolling 40-point buffer, Recharts visualization
- **Physics simulation**: UPS (NORMAL/BATTERY/BYPASS), generator ATS (STANDBY → STARTING → TRANSFERRED → RECOVERY, FAULT on start failure), CRAH setpoint driving rack inlet temperature and cooling energy
- **Electrical topology**: Live SLD diagram — grid → transformer → UPS → PDU → halls, with power-flow animation and fault highlighting
- **Multi-subsystem view**: Electrical · Fire Safety · Environment · Access Control
- **Alarm management**: Active / Acknowledged / Cleared (history) · Acknowledge (any user) and Clear (ADMIN)
- **Energy analytics**: 1H/6H/24H/7D range · PUE · IT load vs cooling breakdown
- **Fault injection (ADMIN)**: mains loss, CRAH trip, rack overload, generator start failure — each fault expires after 60 s (max 120 s) and is shared by every viewer
- **User directory (ADMIN)**: demo list of accounts; sign-in uses the two built-in demo users
- **Dark/light theme**: Flash-free toggle · CSS design tokens
- **Skeleton loaders**: KPI · Table · Chart skeletons while WebSocket connects

## Local Setup

**Full stack (first time):**
```bash
cp .env.example .env
# Set JWT_SECRET (≥32 chars) and POSTGRES_PASSWORD in .env
docker compose up --build
```

**Frontend only (backend already running or Render URL configured):**
```bash
cd apps/web
npm install        # first time only
npm run dev
```

**Backend only (without Docker):**
```bash
cd services/api
python -m venv .venv

# macOS/Linux:
source .venv/bin/activate
# Windows PowerShell:
.venv\Scripts\Activate.ps1

pip install -r requirements.txt
uvicorn api_service:app --reload --port 8000
```

> **No PostgreSQL?** The backend automatically falls back to a local SQLite database if PostgreSQL is unreachable, so the simulator, WebSocket, and all in-memory features work without Docker.

| Service | URL |
|---|---|
| Dashboard | http://localhost:3000 |
| API docs | http://localhost:8000/docs |
| Grafana | http://localhost:3001 (admin / admin) |
| Prometheus | http://localhost:9090 |
| Modbus | localhost:5020 |

**Credentials:** `admin@datacenter.local` / `admin123` · `operator@datacenter.local` / `operator123`

## Modbus Interface

Port `5020` (local/Docker only — not started on Render). Holding registers, function code 3, unsigned 16-bit.

| Slave | Device | Registers |
|---|---|---|
| 1 | UPS-01 | 0 input V ×10 · 1 output V ×10 · 2 load % ×10 · 3 battery % ×10 · 4 mode (0 NORMAL, 1 BATTERY, 2 BYPASS, 3 FAULT) |
| 2 | PDU-A1 | 0 IT load kW ×10 · 1–3 phase A/B/C kW ×10 · 4 load % of rating ×10 |
| 3 | CRAH | 0 supply °C ×10 · 1 return °C ×10 · 2 cooling kW ×10 · 3 fan % ×10 · 4 units online |
| 4 | Generator | 0 state (0 STANDBY … 2 TRANSFERRED, 4 FAULT) · 1 output kW ×10 · 2 frequency Hz ×100 · 3 fuel % ×10 |

## Environment Variables

| Variable | Where | Description |
|---|---|---|
| `JWT_SECRET` | frontend **and** backend | ≥ 32 random chars, same value on both — Next.js signs the session token, FastAPI verifies it |
| `DATABASE_URL` | backend | `postgresql+asyncpg://user:pass@host/db` — omit to use the SQLite fallback |
| `POSTGRES_PASSWORD` | Docker | PostgreSQL password |
| `CORS_ORIGINS` | backend | Comma-separated allowed origins |
| `API_BASE_URL` | frontend | FastAPI URL the server-side proxy forwards to |
| `NEXT_PUBLIC_WS_URL` | frontend | WebSocket URL (`ws://` or `wss://`) |
| `MQTT_HOST` | backend | Mosquitto host (optional) |
| `MODBUS_HOST` | backend | Modbus bind address (`0.0.0.0` in Docker) |

## CI

GitHub Actions runs on every push and pull request to `main`:

- **Frontend**: `npm ci`, TypeScript type-check, Next.js production build
- **API**: ruff lint, alarm-manager and electrical-model unit tests
- **Simulation** / **Simulation E2E**: electrical model, generator state machine, full tick → alarm scenarios
- **API Integration**: auth (JWT, roles), alarms, fault injection, users and Modbus against a live FastAPI app

The Playwright suite in `apps/web/tests/e2e` runs locally (`npm run test:e2e`); it is not part of CI.

## Deploy

See [`deploy/DEPLOY.md`](deploy/DEPLOY.md) for Render + Neon + Vercel.
[`deploy/terraform/`](deploy/terraform/README.md) is an EC2 reference configuration that has not been tested.

> **Live demo on Render's free tier:** the backend sleeps after ~15 minutes idle, and the first
> visit then waits for a cold start (often 30–60 s). The simulator, live alarms, faults and
> chart history live in memory, so each wake-up starts from a fresh, healthy facility.

---

**Faryan Rajabi** — frontend & dashboard engineer
- LinkedIn: [linkedin.com/in/faryan-rajabi](https://www.linkedin.com/in/faryan-rajabi)
- GitHub: [github.com/faryanra](https://github.com/faryanra)
