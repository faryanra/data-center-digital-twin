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

The same snapshot updates Modbus TCP holding registers on port 5020, so any standard SCADA tool can read live values without custom integration.

**Facility model:** two data halls (Hall A: 10 racks, Hall B: 8 racks), UPS bank, PDU, two CRAH units, diesel generator with ATS.

## Architecture

### System Architecture

```mermaid
flowchart TD
    Browser["Browser (PWA)"] --> Next["Next.js 16 · App Router :3000"]
    Next --> Proxy["/api/proxy/[...path]"]
    Proxy --> FastAPI["FastAPI :8000"]

    FastAPI --> WS["WebSocket /ws/facility\n5-second tick"]
    FastAPI --> Modbus["Modbus TCP :5020\n4 slaves · 6 registers each"]
    FastAPI --> PG["PostgreSQL\nalarms · sensors · users"]
    FastAPI --> Influx["InfluxDB\ntime-series (optional)"]

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
        NORMAL --> BATTERY : mains loss
        BATTERY --> NORMAL : mains restored
        BATTERY --> BYPASS  : maintenance
        BYPASS  --> NORMAL  : bypass off
        NORMAL  --> FAULT   : overload / fault
        FAULT   --> NORMAL  : reset
    }

    state Generator {
        STANDBY --> STARTING    : ATS triggers (mains lost)
        STARTING --> TRANSFERRED : engine ready
        TRANSFERRED --> RECOVERY : mains restored
        RECOVERY --> STANDBY    : cooldown complete
    }
```

### Auth Flow

```mermaid
sequenceDiagram
    participant Browser
    participant Next as Next.js Server Action
    participant JWT as jose (local)
    participant FastAPI

    Browser->>Next: POST /login {email, password}
    Next->>FastAPI: POST /auth/token
    FastAPI-->>Next: {access_token, role}
    Next->>JWT: sign HS256 (8 h)
    JWT-->>Next: signed token
    Next-->>Browser: Set-Cookie: auth_token (httpOnly)

    Browser->>Next: GET /dashboard
    Next->>JWT: verify cookie locally
    JWT-->>Next: {email, role} — no backend call
    Next-->>Browser: 200 with X-User-Role forwarded to FastAPI
```

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript |
| Charts | Recharts — real-time area/bar charts |
| Backend | FastAPI, Python 3.13, async |
| Auth | JWT (jose), `httpOnly` cookie, bcrypt (user creation) |
| Simulation | Pure Python dataclass — replaceable interface |
| Database | PostgreSQL 16, SQLAlchemy async |
| Industrial | Modbus TCP :5020, pymodbus 3.7 — 4 slaves, 6 registers each |
| Messaging | Mosquitto MQTT :1883 (optional telemetry publish) |
| Observability | Prometheus + Grafana — pre-provisioned dashboards |
| Infra | Docker Compose (local), Terraform EC2 (cloud) |
| PWA | Web App Manifest — installable on desktop and mobile |

## Key Features

- **Real-time telemetry**: WebSocket at 5-second tick, rolling 40-point buffer, Recharts visualization
- **Physics simulation**: UPS state machine (NORMAL/BATTERY/BYPASS/FAULT), Generator ATS (STANDBY → STARTING → TRANSFERRED → RECOVERY), CRAH cooling
- **Electrical topology**: Live SLD diagram — grid → transformer → UPS → PDU → halls
- **Multi-subsystem view**: Electrical · Fire Safety · Environment · Access Control
- **Alarm management**: Active/Acknowledged/Cleared · Acknowledge and Clear (role-gated)
- **Energy analytics**: 1H/6H/24H/7D range · PUE · IT load vs cooling breakdown
- **Fault injection**: Trip CRAH, simulate mains loss, inject UPS overload (OPERATOR role)
- **User management**: Add/remove accounts with role assignment (ADMIN only)
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

Port `5020` (local/Docker only — disabled on Render).

| Slave | Device | Registers 0–5 |
|---|---|---|
| 1 | UPS | voltage, current, power, energy, power_factor, frequency |
| 2 | PDU | voltage, current, power, energy, power_factor, frequency |
| 3 | CRAH | inlet_temp, outlet_temp, cooling_capacity, fan_speed, power, set_point |
| 4 | Generator | voltage, frequency, load_pct, fuel_level, run_hours, status |

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | ✅ | Random string ≥ 32 chars — never commit this |
| `DATABASE_URL` | ☐ | `postgresql+asyncpg://user:pass@host/db` — omit to use SQLite fallback |
| `POSTGRES_PASSWORD` | ☐ | PostgreSQL password (Docker only) |
| `CORS_ORIGINS` | ✅ | Comma-separated allowed origins |
| `NEXT_PUBLIC_API_URL` | ✅ | FastAPI base URL seen from the browser |
| `NEXT_PUBLIC_WS_URL` | ✅ | WebSocket URL (`ws://` or `wss://`) |
| `MQTT_BROKER_HOST` | ☐ | Mosquitto host (optional) |
| `INFLUXDB_URL` | ☐ | InfluxDB URL (optional time-series storage) |

## CI

GitHub Actions runs on every push:

- **python**: ruff lint, pytest, FastAPI startup check
- **frontend**: TypeScript type-check (`tsc --noEmit`), Next.js build
- **config**: `docker compose config` validates compose files
- **e2e**: Playwright — login, dashboard KPIs, alarms, facility-map, settings

## Deploy

See [`deploy/DEPLOY.md`](deploy/DEPLOY.md) for Render + Neon + Vercel.  
Terraform for EC2 is in [`deploy/terraform/`](deploy/terraform/README.md).

---

**Faryan Rajabi** — frontend & dashboard engineer
- LinkedIn: [linkedin.com/in/faryan-rajabi](https://www.linkedin.com/in/faryan-rajabi)
- GitHub: [github.com/faryanra](https://github.com/faryanra)
