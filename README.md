# DC-NORTH-01 — Data Center Digital Twin

[![CI](https://github.com/faryanra/data-center-digital-twin/actions/workflows/ci.yml/badge.svg)](https://github.com/faryanra/data-center-digital-twin/actions/workflows/ci.yml)

A real-time simulation and monitoring platform for a Tier-III data centre, built to demonstrate how digital-twin technology can support operations without requiring physical hardware.

| Dashboard overview | Energy analytics |
|---|---|
| ![Dashboard](docs/screenshots/01-dashboard.png) | ![Energy](docs/screenshots/02-energy.png) |

| Equipment inventory | |
|---|---|
| ![Equipment](docs/screenshots/03-equipment.png) | |

## What It Monitors

Every 5 seconds a physics-based simulation engine (`FacilitySimulator`) computes a `FacilitySnapshot` — power usage, cooling efficiency, PUE, generator state, per-hall temperatures, and active alarms — and broadcasts it over WebSocket to all connected dashboards simultaneously.

The same snapshot updates Modbus TCP holding registers on port 5020, so any standard SCADA tool can read live values without custom integration.

**Facility model:** two data halls (Hall A: 10 racks, Hall B: 8 racks), UPS bank, PDU, two CRAH units, diesel generator with ATS.

## Architecture

```
Browser (PWA)
└── Next.js 16 (App Router)  :3000
    └── /api/proxy/[...path] → FastAPI  :8000
        ├── WebSocket /ws/facility  (5 s tick)
        ├── Modbus TCP  :5020  (4 slaves, local/Docker only)
        ├── PostgreSQL  (alarms, sensors, users)
        └── InfluxDB  (time-series, optional)
```

| Decision | Rationale |
|---|---|
| WebSocket over SSE | Bi-directional — fault injection from the UI needs a write channel |
| Pure-Python `tick()` | Sub-millisecond, no async overhead; output is a typed dataclass |
| Modbus TCP :5020 | Standard industrial protocol; any SCADA tool reads it without custom code |
| `httpOnly` JWT cookie | XSS-resistant auth; proxy extracts role headers before forwarding to API |

## Auth Flow

Login is handled entirely in Next.js via a server action — no FastAPI call during authentication. The server action validates credentials, signs a JWT (HS256, 8 h), and sets an `httpOnly` cookie. On subsequent requests the proxy decodes that cookie and forwards `X-User-Email` + `X-User-Role` headers to FastAPI. FastAPI uses `Depends(require_operator)` or `Depends(require_admin)` to enforce roles.

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
| `DATABASE_URL` | ✅ | `postgresql+asyncpg://user:pass@host/db` |
| `POSTGRES_PASSWORD` | ✅ | PostgreSQL password |
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
