# Deployment Guide

This guide deploys DC-NORTH-01 to a free, production-style stack:

| Layer | Service | Role |
|---|---|---|
| Database | **Neon** | Managed PostgreSQL |
| Backend | **Render** | FastAPI (REST + WebSocket) |
| Frontend | **Vercel** | Next.js dashboard |

The browser only ever talks to Vercel. Vercel proxies API calls to Render server-side, and
the dashboard opens one WebSocket straight to Render for live telemetry.

```
Browser ──► Vercel (Next.js) ──► Render (FastAPI) ──► Neon (PostgreSQL)
   └──────────── WebSocket (wss) ────────────┘
```

> The repo also ships Terraform (AWS EC2 + ECS Fargate) and Kubernetes manifests for
> self-hosted targets. This guide covers the managed path, which needs no servers.

---

## Before you start

- A GitHub account with this repository pushed.
- Free accounts on [neon.tech](https://neon.tech), [render.com](https://render.com),
  and [vercel.com](https://vercel.com).
- A JWT secret. Generate one and keep it:
  ```bash
  openssl rand -hex 32
  ```

---

## Step 1 — Neon (PostgreSQL)

1. **New Project** → name `dc-north-01` → pick a region close to you (e.g. *EU (Frankfurt)*).
2. After it is created, open **Connection Details** and copy the connection string. It looks like:
   ```
   postgresql://user:pass@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```
3. Keep this string — it is `DATABASE_URL` in Step 2.

> You can paste the Neon string as-is. The backend strips the `sslmode` / `channel_binding`
> parameters that the async driver does not understand and enables TLS automatically.

---

## Step 2 — Render (FastAPI backend)

1. **New** → **Web Service** → connect your GitHub repo.
2. Configure:

   | Setting | Value |
   |---|---|
   | Name | `dc-north-01-api` |
   | Region | closest to your Neon region |
   | Branch | `main` |
   | Root Directory | `services/api` |
   | Runtime | Python 3 |
   | Build Command | `pip install -r requirements.txt` |
   | Start Command | `uvicorn api_service:app --host 0.0.0.0 --port $PORT` |
   | Health Check Path | `/health` |

3. **Environment** → add:

   | Key | Value | Required |
   |---|---|---|
   | `DATABASE_URL` | the Neon string from Step 1 | ✅ |
   | `CORS_ORIGINS` | your Vercel URL (set after Step 3) | ✅ |
   | `API_KEY` | a random string, or leave unset | optional |
   | `MQTT_HOST` / `MODBUS_PORT` | leave unset — defaults are fine | optional |

   The Modbus server (port 5020) and MQTT publisher start as background tasks; they are not
   exposed by Render and the app runs normally without them.

4. **Create Web Service**. When the deploy is green, copy the URL, e.g.
   `https://dc-north-01-api.onrender.com`.

5. Verify:
   ```bash
   curl https://dc-north-01-api.onrender.com/health      # {"status":"ok","service":"api"}
   ```

> Render's free tier sleeps after ~15 minutes idle; the first request afterwards takes a few
> seconds to wake it. WebSockets are supported, so live telemetry works.

---

## Step 3 — Vercel (Next.js frontend)

1. **Add New** → **Project** → import the same repo.
2. Configure:

   | Setting | Value |
   |---|---|
   | Framework Preset | Next.js (auto-detected) |
   | Root Directory | `apps/web` |

3. **Environment Variables** → add:

   | Key | Value | Notes |
   |---|---|---|
   | `API_BASE_URL` | `https://dc-north-01-api.onrender.com` | server-side proxy target (no `NEXT_PUBLIC_`) |
   | `NEXT_PUBLIC_WS_URL` | `wss://dc-north-01-api.onrender.com/ws/facility` | browser → backend WebSocket |
   | `JWT_SECRET` | the secret from *Before you start* | signs the login cookie |
   | `API_KEY` | same value as on Render | only if you set `API_KEY` on Render |

4. **Deploy**. Copy the resulting URL, e.g. `https://dc-north-01.vercel.app`.

---

## Step 4 — connect the two

1. Back in **Render** → the service → **Environment**, set `CORS_ORIGINS` to your Vercel URL
   (`https://dc-north-01.vercel.app`) and **save** — Render redeploys automatically.
2. Open your Vercel URL and sign in.

### Login credentials

User accounts are defined in `apps/web/lib/auth/mock-auth.ts`:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@datacenter.local` | `admin123` |
| Operator | `operator@datacenter.local` | `operator123` |

**Change these before sharing the site publicly** — edit `mock-auth.ts`, commit, and redeploy.
Admin can use the Controls page and manage users; Operator is read-only on controls.

---

## Environment variable reference

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | Render | PostgreSQL connection (Neon) |
| `CORS_ORIGINS` | Render | Allowed browser origin (the Vercel URL) |
| `API_KEY` | Render + Vercel | Optional key for `/api/*` endpoints; must match on both |
| `API_BASE_URL` | Vercel | Backend URL the Next.js proxy forwards to |
| `NEXT_PUBLIC_WS_URL` | Vercel | WebSocket URL the browser connects to |
| `JWT_SECRET` | Vercel | Signs/verifies the auth cookie |
| `MQTT_HOST`, `MQTT_PORT` | Render | Optional MQTT broker (defaults to localhost, non-fatal) |
| `MODBUS_PORT` | Render | Modbus TCP port (default 5020, internal only) |

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Login fails on Vercel | `JWT_SECRET` not set on Vercel, or differs between deploys |
| Dashboard loads but no live data | `NEXT_PUBLIC_WS_URL` must use `wss://` and end with `/ws/facility` |
| API calls return 500 from the proxy | `API_BASE_URL` on Vercel is wrong or Render is asleep — retry after a few seconds |
| Backend fails to start on Render | Check `DATABASE_URL`; paste the Neon string exactly |
| Energy/Reports charts empty at first | History fills over time (one point every 15 s); wait a few minutes |
| 403 on Energy/Reports/Simulation | If `API_KEY` is set on Render, set the same value on Vercel |

---

## Local deployment (Docker)

To run the whole stack on one machine instead of the cloud:

```bash
cp .env.example .env         # set JWT_SECRET and POSTGRES_PASSWORD
make up                      # or: docker compose up --build
```

| Service | URL |
|---|---|
| Dashboard | http://localhost:3000 |
| API docs | http://localhost:8000/docs |
| Grafana | http://localhost:3001 |
| Prometheus | http://localhost:9090 |

`docker-compose.prod.yml` adds a PostgreSQL service and MQTT authentication for a
self-hosted production deployment.
