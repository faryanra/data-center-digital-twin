"""FastAPI read API for infrastructure monitoring clients."""

from __future__ import annotations

import asyncio
import logging
import os
import re
import sys
import time
from contextlib import asynccontextmanager

# Project root → finds simulation.*
# services/api  → finds alarms, alarm_evaluator
_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, '..', '..'))
sys.path.insert(0, _HERE)
from simulation.electrical.facility_sim import FacilitySimulator

from alarm_evaluator import evaluate as evaluate_alarms
from alarms import AlarmManager
from modbus_gateway import run_modbus_server, update_registers_from_snapshot
from mqtt_publisher import init_mqtt, publish_snapshot, shutdown_mqtt
from device_profile_loader import load_all_profiles
from database import init_db, AsyncSessionLocal
from alarm_persistence import upsert_alarm, query_alarm_history

_sim = FacilitySimulator()
_alarm_mgr = AlarmManager()

import uvicorn
from common.database import Database
from common.metrics import (
    alerts_active_total,
    devices_offline,
    devices_online,
    energy_kwh_total,
    frequency_hz,
    power_consumption_watts,
    power_factor,
    temperature_celsius,
    voltage_volts,
)
from common.settings import Settings, get_settings
from fastapi import (
    Body,
    Depends,
    FastAPI,
    Header,
    HTTPException,
    Path,
    Query,
    Security,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import APIKeyHeader
from prometheus_fastapi_instrumentator import Instrumentator
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.requests import Request

LOG = logging.getLogger(__name__)

_DEVICE_ID_RE = re.compile(r"^[a-zA-Z0-9_-]+$")


class FaultRequest(BaseModel):
    fault_type: str
_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
limiter = Limiter(key_func=get_remote_address)


class ConnectionManager:
    """Tracks connected WebSocket clients and broadcasts snapshots."""

    def __init__(self) -> None:
        self.active: set[WebSocket] = set()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.active.add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self.active.discard(ws)

    async def broadcast(self, data: dict) -> None:
        dead: set[WebSocket] = set()
        for ws in list(self.active):
            try:
                await ws.send_json(data)
            except Exception:
                dead.add(ws)
        self.active -= dead


manager = ConnectionManager()


from facility_history import record as record_history, history as get_facility_history


def _snapshot_to_dict(snap) -> dict:  # type: ignore[no-untyped-def]
    return {
        "ts": time.time(),
        "pue": round(snap.pue, 3),
        "it_load_kw": round(snap.it_load_w / 1000, 1),
        "total_power_kw": round(snap.total_facility_power_w / 1000, 1),
        "utility_ok": snap.utility_online,
        "generator_state": snap.generator_state,
        "generator_fuel_pct": round(snap.generator_fuel_pct, 1),
        "per_hall_cooling_kw": snap.per_hall_cooling_kw,
        "halls": [
            {
                "id": pdu.location,
                "name": pdu.location.replace("data-hall-", "Data Hall ").replace("-a", " A").replace("-b", " B") if "data-hall-" in pdu.location else f"Data Hall {pdu.location}",
                "total_kw": round(pdu.it_load_w / 1000, 1),
                "capacity_kw": round(sum(r.active_power_w for r in pdu.racks) / 1000 * 1.5 + 20, 1),
                "avg_inlet_c": round(
                    sum(r.inlet_temp_c for r in pdu.racks) / len(pdu.racks)
                    if pdu.racks else 0.0,
                    1,
                ),
                "crah_online": snap.cooling.crah_online_count if "hall-a" in pdu.location else snap.cooling.crah_online_count,
                "crah_total": snap.cooling.crah_total_count,
                "rack_count": len(pdu.racks),
            }
            for pdu in snap.pdus
        ],
        "ups": [
            {
                "id": snap.ups.id,
                "mode": snap.ups.mode,
                "load_pct": round(snap.ups.load_percent, 1),
                "battery_pct": round(snap.ups.battery_soc * 100, 1),
                "input_ok": snap.ups.input_ok,
            }
        ],
        "cooling": {
            "supply_temp_c": round(snap.cooling.supply_temp_c, 1),
            "return_temp_c": round(snap.cooling.return_temp_c, 1),
            "crah_online": snap.cooling.crah_online_count,
            "crah_total": snap.cooling.crah_total_count,
            "cop": round(snap.cooling.cop, 2),
            "cooling_power_kw": round(snap.cooling.cooling_power_w / 1000, 1),
        },
        "pdus": [
            {
                "id": pdu.id,
                "location": pdu.location,
                "load_kw": round(pdu.it_load_w / 1000, 1),
                "load_pct": round(pdu.load_factor * 100, 1),
                "racks": [
                    {
                        "id": r.id,
                        "load_pct": round(r.load_factor * 100, 1),
                        "inlet_c": round(r.inlet_temp_c, 1),
                        "outlet_c": round(r.outlet_temp_c, 1),
                        "status": r.status,
                        "kw": round(r.active_power_w / 1000, 2),
                    }
                    for r in pdu.racks
                ],
            }
            for pdu in snap.pdus
        ],
        "racks": [
            {
                "id": r.id,
                "load_pct": round(r.load_factor * 100, 1),
                "inlet_c": round(r.inlet_temp_c, 1),
                "outlet_c": round(r.outlet_temp_c, 1),
                "status": r.status,
                "kw": round(r.active_power_w / 1000, 2),
            }
            for pdu in snap.pdus
            for r in pdu.racks
        ],
        "alarms": {
            "active_count": _alarm_mgr.active_count,
            "critical_count": _alarm_mgr.critical_count,
        },
        "fire_safety": {
            "system_armed": snap.fire_safety.system_armed,
            "last_alarm_zone": snap.fire_safety.last_alarm_zone,
            "zones": [
                {
                    "id": z.id, "name": z.name, "status": z.status,
                    "smoke_ppm": round(z.smoke_ppm, 1),
                    "heat_c": round(z.heat_c, 1),
                    "suppression_agent_pct": round(z.suppression_agent_pct, 1),
                }
                for z in snap.fire_safety.zones
            ],
        },
        "access_control": {
            "intrusion_detected": snap.access_control.intrusion_detected,
            "doors": [
                {
                    "id": d.id, "location": d.location, "locked": d.locked,
                    "badge_required": d.badge_required, "last_event": d.last_event,
                }
                for d in snap.access_control.doors
            ],
        },
        "environment": {
            "zones": [
                {
                    "id": z.id, "location": z.location,
                    "temp_c": round(z.temp_c, 1),
                    "humidity_pct": round(z.humidity_pct, 1),
                    "airflow_mps": round(z.airflow_mps, 2),
                    "status": z.status,
                }
                for z in snap.environment.zones
            ],
        },
        "power_distribution": {
            "bus_voltage_v": round(snap.power_distribution.bus_voltage_v, 1),
            "bus_frequency_hz": round(snap.power_distribution.bus_frequency_hz, 2),
            "branches": [
                {
                    "id": b.id, "label": b.label, "phase": b.phase,
                    "amps": round(b.amps, 1), "volts": round(b.volts, 1),
                    "breaker_on": b.breaker_on,
                }
                for b in snap.power_distribution.branches
            ],
        },
        "crah_setpoint_c": snap.crah_setpoint_c,
        "ups_bypass_enabled": snap.ups_bypass_enabled,
        "gen_auto_start": snap.gen_auto_start,
    }


async def _verify_api_key(key: str | None = Security(_api_key_header)) -> None:
    expected = get_settings().api_key
    if expected and key != expected:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing API key",
        )


def get_current_user(
    x_user_email: str = Header(alias="X-User-Email"),
    x_user_role: str = Header(alias="X-User-Role"),
) -> dict:
    return {"email": x_user_email, "role": x_user_role}


def require_operator(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") not in ("OPERATOR", "ADMIN"):
        raise HTTPException(status_code=403, detail="Operator or Admin required")
    return current_user


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") != "ADMIN":
        raise HTTPException(status_code=403, detail="Admin only")
    return current_user


class DeviceResponse(BaseModel):
    id: int
    device_id: str
    name: str
    type: str
    building: str | None = None
    floor: str | None = None
    unit: str | None = None
    topic: str | None = None
    threshold: float | None = None
    enabled: bool
    created_at: str | None = None
    updated_at: str | None = None
    current_value: float | None = None
    last_seen: str | None = None


class TelemetryResponse(BaseModel):
    id: int
    device_id: str
    value: float
    timestamp: str


class AlertResponse(BaseModel):
    id: int
    device_id: str
    value: float
    threshold: float
    severity: str
    status: str
    timestamp: str
    message: str


class SummaryResponse(BaseModel):
    total_devices: int
    active_alerts: int
    latest_telemetry: list[TelemetryResponse]


def _serialize_device(row: dict) -> dict:
    row = dict(row)
    row["enabled"] = bool(row["enabled"])
    for key in ("created_at", "updated_at", "last_seen"):
        if row.get(key) is not None:
            row[key] = str(row[key])
    return row


def _serialize_rows(rows: list[dict]) -> list[dict]:
    return [{**row, "timestamp": str(row["timestamp"])} for row in rows]


async def _update_platform_gauges(database: Database) -> None:
    """Background task: refresh device and alert gauges every 30 s."""
    while True:
        try:
            await asyncio.sleep(30)
            now = time.time()
            all_devices = database.list_devices_last_seen()
            online = 0
            offline = 0
            for d in all_devices:
                ls = d.get("last_seen")
                if ls is None:
                    offline += 1
                else:
                    ts = ls.timestamp() if hasattr(ls, "timestamp") else float(ls)
                    if now - ts < 60:
                        online += 1
                    else:
                        offline += 1
            devices_online.set(online)
            devices_offline.set(offline)

            rows = database._query(
                "SELECT severity, COUNT(*) AS cnt FROM alerts "
                "WHERE status = 'active' GROUP BY severity"
            )
            for row in rows:
                alerts_active_total.labels(severity=row["severity"]).set(row["cnt"])

            # Per-device telemetry gauges — query latest value per device type
            _gauge_map = {
                "power":        (power_consumption_watts, lambda v: v * 1000),
                "energy":       (energy_kwh_total,        lambda v: v),
                "temperature":  (temperature_celsius,     lambda v: v),
                "voltage":      (voltage_volts,           lambda v: v),
                "power_factor": (power_factor,            lambda v: v),
                "frequency":    (frequency_hz,            lambda v: v),
            }
            latest_rows = database._query(
                "SELECT d.device_id, d.type, t.value "
                "FROM devices d "
                "JOIN telemetry t ON t.id = ("
                "  SELECT t2.id FROM telemetry t2 WHERE t2.device_id = d.id "
                "  ORDER BY t2.timestamp DESC LIMIT 1"
                ") WHERE d.type IN ('power','energy','temperature','voltage','power_factor','frequency')"
            )
            for r in latest_rows:
                entry = _gauge_map.get(r["type"])
                if entry:
                    gauge, transform = entry
                    gauge.labels(device_id=r["device_id"]).set(transform(r["value"]))
        except Exception:
            LOG.warning("Gauge update error", exc_info=True)


def create_app(database: Database | None = None, settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    database = database or Database.from_settings(settings)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        database.initialize()
        await init_db()

        init_mqtt(
            host=os.getenv("MQTT_HOST", "localhost"),
            port=int(os.getenv("MQTT_PORT", "1883")),
        )
        _modbus_task = asyncio.create_task(
            run_modbus_server("0.0.0.0", int(os.getenv("MODBUS_PORT", "5020")))
        )

        async def sim_broadcast_loop() -> None:
            while True:
                try:
                    snap = _sim.tick()
                    evaluate_alarms(snap, _alarm_mgr)
                    update_registers_from_snapshot(snap)
                    publish_snapshot(snap)
                    snap_dict = _snapshot_to_dict(snap)
                    record_history(snap_dict)
                    await manager.broadcast(snap_dict)
                except Exception:
                    LOG.warning("Sim broadcast error", exc_info=True)
                await asyncio.sleep(5)

        gauge_task = asyncio.create_task(_update_platform_gauges(database))
        sim_task = asyncio.create_task(sim_broadcast_loop())

        from snmp_poller import init_snmp_devices, poll_loop as snmp_poll_loop
        init_snmp_devices()
        snmp_task = asyncio.create_task(snmp_poll_loop(30))

        yield
        _modbus_task.cancel()
        shutdown_mqtt()
        gauge_task.cancel()
        sim_task.cancel()
        snmp_task.cancel()

    app = FastAPI(title="DC-NORTH-01 Data Center Digital Twin API", version="2.0.0", lifespan=lifespan)

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    Instrumentator().instrument(app).expose(app, endpoint="/metrics")

    origins = (
        settings.cors_origins.split(",")
        if settings.cors_origins
        else ["http://localhost:3000"]
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["X-API-Key", "Content-Type", "X-User-Email", "X-User-Role"],
        allow_credentials=True,
    )

    def get_database() -> Database:
        return database

    # ----- public -----

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "api"}

    # ── Sensor registry ───────────────────────────────────────────────────────────

    _sensors: list[dict] = [
        {"id": "temp-hall-a-01", "type": "temperature", "location": "Data Hall A", "unit": "°C", "enabled": True},
        {"id": "temp-hall-b-01", "type": "temperature", "location": "Data Hall B", "unit": "°C", "enabled": True},
        {"id": "power-pdu-a01",  "type": "power",       "location": "PDU A",       "unit": "kW", "enabled": True},
        {"id": "power-pdu-b01",  "type": "power",       "location": "PDU B",       "unit": "kW", "enabled": True},
        {"id": "humidity-a01",   "type": "humidity",    "location": "Data Hall A", "unit": "%",  "enabled": False},
    ]

    @app.get("/sensors")
    async def list_sensors() -> list:
        return _sensors

    @app.post("/sensors")
    async def add_sensor(body: dict = Body(...)) -> dict:
        sensor = {
            "id": f"{body.get('type','sensor')}-{len(_sensors)+1:03d}",
            "type": body.get("type", "temperature"),
            "location": body.get("location", "Unknown"),
            "unit": body.get("unit", ""),
            "enabled": True,
        }
        _sensors.append(sensor)
        return sensor

    @app.patch("/sensors/{sensor_id}")
    async def toggle_sensor(sensor_id: str) -> dict:
        for s in _sensors:
            if s["id"] == sensor_id:
                s["enabled"] = not s["enabled"]
                return s
        raise HTTPException(status_code=404, detail="Sensor not found")

    @app.websocket("/ws/facility")
    async def ws_facility(websocket: WebSocket) -> None:
        await manager.connect(websocket)
        try:
            while True:
                await asyncio.sleep(0.1)
        except WebSocketDisconnect:
            manager.disconnect(websocket)

    # ----- authenticated -----

    @app.get("/api/devices", response_model=list[DeviceResponse], dependencies=[Depends(_verify_api_key)])
    @limiter.limit("60/minute")
    def list_devices(request: Request, db: Database = Depends(get_database)) -> list[dict]:
        return [_serialize_device(row) for row in db.list_devices()]

    @app.get("/api/devices/{device_id}", response_model=DeviceResponse, dependencies=[Depends(_verify_api_key)])
    @limiter.limit("60/minute")
    def get_device(
        request: Request,
        device_id: str = Path(pattern=r"^[a-zA-Z0-9_-]+$"),
        db: Database = Depends(get_database),
    ) -> dict:
        device = db.get_device(device_id)
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")
        rows = db.list_devices()
        enriched = next((row for row in rows if row["device_id"] == device_id), device)
        return _serialize_device(enriched)

    @app.get("/api/telemetry", response_model=list[TelemetryResponse], dependencies=[Depends(_verify_api_key)])
    @limiter.limit("60/minute")
    def list_telemetry(
        request: Request,
        db: Database = Depends(get_database),
        limit: int = Query(default=100, ge=1, le=1000),
    ) -> list[dict]:
        return _serialize_rows(db.list_telemetry(limit=limit))

    @app.get("/api/telemetry/{device_id}", response_model=list[TelemetryResponse], dependencies=[Depends(_verify_api_key)])
    @limiter.limit("60/minute")
    def get_telemetry(
        request: Request,
        device_id: str = Path(pattern=r"^[a-zA-Z0-9_-]+$"),
        db: Database = Depends(get_database),
        limit: int = Query(default=100, ge=1, le=1000),
    ) -> list[dict]:
        if not db.get_device(device_id):
            raise HTTPException(status_code=404, detail="Device not found")
        return _serialize_rows(db.list_telemetry(device_id, limit))

    @app.get("/api/alerts", response_model=list[AlertResponse], dependencies=[Depends(_verify_api_key)])
    @limiter.limit("60/minute")
    def list_alerts(
        request: Request,
        db: Database = Depends(get_database),
        limit: int = Query(default=100, ge=1, le=1000),
    ) -> list[dict]:
        return _serialize_rows(db.list_alerts(limit=limit))

    @app.get("/api/alerts/{device_id}", response_model=list[AlertResponse], dependencies=[Depends(_verify_api_key)])
    @limiter.limit("60/minute")
    def get_alerts(
        request: Request,
        device_id: str = Path(pattern=r"^[a-zA-Z0-9_-]+$"),
        db: Database = Depends(get_database),
        limit: int = Query(default=100, ge=1, le=1000),
    ) -> list[dict]:
        if not db.get_device(device_id):
            raise HTTPException(status_code=404, detail="Device not found")
        return _serialize_rows(db.list_alerts(device_id, limit))

    @app.get("/api/summary", response_model=SummaryResponse, dependencies=[Depends(_verify_api_key)])
    @limiter.limit("60/minute")
    def summary(request: Request, db: Database = Depends(get_database)) -> dict:
        result = db.summary()
        result["latest_telemetry"] = _serialize_rows(result["latest_telemetry"])
        return result

    # ----- energy analytics -----

    @app.get("/api/energy/summary", dependencies=[Depends(_verify_api_key)])
    @limiter.limit("60/minute")
    def energy_summary(request: Request, db: Database = Depends(get_database)) -> dict:
        def _latest(device_type: str) -> list[dict]:
            return db._query(
                "SELECT d.device_id, t.value, t.timestamp "
                "FROM devices d "
                "JOIN telemetry t ON t.id = ("
                "  SELECT t2.id FROM telemetry t2 WHERE t2.device_id = d.id "
                "  ORDER BY t2.timestamp DESC LIMIT 1"
                ") WHERE d.type = ?",
                (device_type,),
            )

        power_rows = _latest("power")
        energy_rows = _latest("energy")
        pf_rows = _latest("power_factor")
        freq_rows = _latest("frequency")

        total_power = sum(r["value"] for r in power_rows)
        total_energy = sum(r["value"] for r in energy_rows)
        avg_pf = (sum(r["value"] for r in pf_rows) / len(pf_rows)) if pf_rows else None
        avg_freq = (sum(r["value"] for r in freq_rows) / len(freq_rows)) if freq_rows else None

        peak_rows = db._query(
            "SELECT t.value, t.timestamp FROM telemetry t "
            "JOIN devices d ON d.id = t.device_id "
            "WHERE d.type = 'power' AND t.timestamp > datetime('now', '-24 hours') "
            "ORDER BY t.value DESC LIMIT 1"
        )
        peak_kw = peak_rows[0]["value"] if peak_rows else None
        peak_at = str(peak_rows[0]["timestamp"]) if peak_rows else None

        devices_list = [
            {"device_id": r["device_id"], "latest_kw": r["value"], "latest_at": str(r["timestamp"])}
            for r in power_rows
        ]

        return {
            "total_power_kw": round(total_power, 4),
            "total_energy_kwh": round(total_energy, 4),
            "avg_power_factor": round(avg_pf, 4) if avg_pf is not None else None,
            "avg_frequency_hz": round(avg_freq, 4) if avg_freq is not None else None,
            "peak_power_kw": round(peak_kw, 4) if peak_kw is not None else None,
            "peak_power_at": peak_at,
            "devices": devices_list,
        }

    @app.get("/api/energy/history", dependencies=[Depends(_verify_api_key)])
    @limiter.limit("60/minute")
    def energy_history(
        request: Request,
        db: Database = Depends(get_database),
        device_id: str = Query(pattern=r"^[a-zA-Z0-9_-]+$"),
        hours: int = Query(default=24, ge=1, le=168),
    ) -> dict:
        device = db.get_device(device_id)
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")

        rows = db._query(
            "SELECT t.timestamp, t.value FROM telemetry t "
            "JOIN devices d ON d.id = t.device_id "
            "WHERE d.device_id = ? AND t.timestamp > datetime('now', '-' || ? || ' hours') "
            "ORDER BY t.timestamp ASC LIMIT 1000",
            (device_id, hours),
        )

        type_to_unit = {
            "power": "kW", "energy": "kWh", "voltage": "V",
            "current": "A", "temperature": "°C", "power_factor": "pf",
            "frequency": "Hz",
        }
        unit = type_to_unit.get(device.get("type", ""), "")

        return {
            "device_id": device_id,
            "metric_type": device.get("type"),
            "unit": unit,
            "readings": [{"timestamp": str(r["timestamp"]), "value": r["value"]} for r in rows],
        }

    @app.get("/api/energy/daily", dependencies=[Depends(_verify_api_key)])
    @limiter.limit("60/minute")
    def energy_daily(
        request: Request,
        db: Database = Depends(get_database),
        days: int = Query(default=7, ge=1, le=90),
    ) -> dict:
        energy_rows = db._query(
            "SELECT DATE(t.timestamp) AS date, SUM(t.value) AS total_kwh "
            "FROM telemetry t JOIN devices d ON d.id = t.device_id "
            "WHERE d.type = 'energy' "
            "GROUP BY DATE(t.timestamp) ORDER BY date DESC LIMIT ?",
            (days,),
        )
        peak_rows = db._query(
            "SELECT DATE(t.timestamp) AS date, MAX(t.value) AS peak_kw "
            "FROM telemetry t JOIN devices d ON d.id = t.device_id "
            "WHERE d.type = 'power' "
            "GROUP BY DATE(t.timestamp) ORDER BY date DESC LIMIT ?",
            (days,),
        )
        pf_rows = db._query(
            "SELECT DATE(t.timestamp) AS date, AVG(t.value) AS avg_pf "
            "FROM telemetry t JOIN devices d ON d.id = t.device_id "
            "WHERE d.type = 'power_factor' "
            "GROUP BY DATE(t.timestamp) ORDER BY date DESC LIMIT ?",
            (days,),
        )

        peak_by_date = {str(r["date"]): r["peak_kw"] for r in peak_rows}
        pf_by_date = {str(r["date"]): r["avg_pf"] for r in pf_rows}

        result_days = []
        for r in energy_rows:
            d = str(r["date"])
            result_days.append({
                "date": d,
                "total_kwh": round(float(r["total_kwh"]), 4) if r["total_kwh"] is not None else 0,
                "peak_kw": round(float(peak_by_date[d]), 4) if d in peak_by_date else None,
                "avg_power_factor": round(float(pf_by_date[d]), 4) if d in pf_by_date else None,
            })

        return {"days": result_days}

    # ----- facility history (role-gated, not api-key) -----

    @app.get("/facility/history")
    async def facility_history(
        hours: int = Query(default=24, ge=1, le=168),
        current_user: dict = Depends(get_current_user),
    ) -> dict:
        return {"hours": hours, "points": get_facility_history(hours)}

    # ----- alarms -----

    @app.get("/alarms")
    async def get_alarms(state: str = "all") -> list[dict]:
        alarms = _alarm_mgr.list_active() if state == "active" else _alarm_mgr.list_all()
        return [
            {
                "id": a.id,
                "severity": a.severity.value,
                "source": a.source,
                "message": a.message,
                "state": a.state.value,
                "raised_at": a.raised_at,
                "acked_by": a.acked_by,
                "acked_at": a.acked_at,
            }
            for a in alarms
        ]

    @app.post("/alarms/{alarm_id}/acknowledge")
    async def acknowledge_alarm(
        alarm_id: str,
        current_user: dict = Depends(get_current_user),
    ) -> dict:
        alarm = _alarm_mgr.acknowledge(alarm_id, current_user["email"])
        if not alarm:
            raise HTTPException(404, "Alarm not found or already acknowledged")
        return {"ok": True}

    @app.delete("/alarms/{alarm_id}")
    async def clear_alarm(
        alarm_id: str,
        current_user: dict = Depends(require_admin),
    ) -> dict:
        if not _alarm_mgr.clear(alarm_id):
            raise HTTPException(404, "Alarm not found")
        return {"ok": True}

    @app.get("/alarms/history")
    async def alarm_history(
        severity: str | None = Query(default=None),
        status_filter: str | None = Query(default=None, alias="status"),
        limit: int = Query(default=100, ge=1, le=500),
        offset: int = Query(default=0, ge=0),
    ) -> list[dict]:
        async with AsyncSessionLocal() as db:
            rows = await query_alarm_history(
                db, severity=severity, status=status_filter,
                limit=limit, offset=offset,
            )
        return [
            {
                "id": r.id,
                "alarm_id": r.alarm_id,
                "severity": r.severity,
                "status": r.status,
                "equipment_id": r.equipment_id,
                "message": r.message,
                "triggered_at": r.triggered_at.isoformat() if r.triggered_at else None,
                "acknowledged_at": r.acknowledged_at.isoformat() if r.acknowledged_at else None,
                "cleared_at": r.cleared_at.isoformat() if r.cleared_at else None,
                "fault_type": r.fault_type,
            }
            for r in rows
        ]

    # ----- simulation fault injection -----

    _VALID_FAULTS = {"utility_loss", "crah_a_trip", "rack_overload", "generator_fail"}

    @app.post("/simulation/fault", status_code=status.HTTP_204_NO_CONTENT,
              dependencies=[Depends(_verify_api_key)])
    def inject_fault(body: FaultRequest) -> None:
        if body.fault_type not in _VALID_FAULTS:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unknown fault '{body.fault_type}'. Valid: {sorted(_VALID_FAULTS)}",
            )
        _sim.inject_fault(body.fault_type)

    @app.delete("/simulation/fault", status_code=status.HTTP_204_NO_CONTENT,
                dependencies=[Depends(_verify_api_key)])
    def clear_all_faults() -> None:
        _sim.clear_faults()

    # ----- control endpoints -----

    _audit_log: list[dict] = []

    def _log_action(user: dict, action: str, params: dict) -> None:
        _audit_log.append({
            "ts": time.time(),
            "user": user["email"],
            "role": user.get("role"),
            "action": action,
            "params": params,
        })
        if len(_audit_log) > 500:
            _audit_log.pop(0)

    @app.get("/control/audit-log")
    async def get_audit_log(
        limit: int = Query(default=50, ge=1, le=200),
        current_user: dict = Depends(require_admin),
    ) -> list[dict]:
        return list(reversed(_audit_log))[:limit]

    @app.post("/control/crah/setpoint", status_code=200)
    async def set_crah_setpoint(
        body: dict = Body(...),
        current_user: dict = Depends(require_operator),
    ) -> dict:
        setpoint = body.get("setpoint_c")
        if not isinstance(setpoint, (int, float)) or not (15.0 <= float(setpoint) <= 30.0):
            raise HTTPException(422, "setpoint_c must be 15–30 °C")
        zone = body.get("zone", "all")
        _sim.set_crah_setpoint(zone, float(setpoint))
        _log_action(current_user, "crah_setpoint", {"zone": zone, "setpoint_c": setpoint})
        return {"ok": True, "setpoint_c": setpoint}

    @app.post("/control/ups/bypass", status_code=200)
    async def set_ups_bypass(
        body: dict = Body(...),
        current_user: dict = Depends(require_operator),
    ) -> dict:
        enabled = body.get("enabled")
        if not isinstance(enabled, bool):
            raise HTTPException(422, "enabled must be bool")
        _sim.set_ups_bypass(enabled)
        _log_action(current_user, "ups_bypass", {"enabled": enabled})
        return {"ok": True, "enabled": enabled}

    @app.post("/control/generator/auto-start", status_code=200)
    async def set_gen_auto_start(
        body: dict = Body(...),
        current_user: dict = Depends(require_operator),
    ) -> dict:
        enabled = body.get("enabled")
        if not isinstance(enabled, bool):
            raise HTTPException(422, "enabled must be bool")
        _sim.set_gen_auto_start(enabled)
        _log_action(current_user, "gen_auto_start", {"enabled": enabled})
        return {"ok": True, "enabled": enabled}

    @app.post("/control/pdu/breaker", status_code=200)
    async def set_pdu_breaker(
        body: dict = Body(...),
        current_user: dict = Depends(require_operator),
    ) -> dict:
        branch_id = body.get("branch_id")
        on = body.get("on")
        if not isinstance(branch_id, str) or not isinstance(on, bool):
            raise HTTPException(422, "branch_id (str) and on (bool) required")
        if not _sim.set_pdu_breaker(branch_id, on):
            raise HTTPException(404, f"Branch '{branch_id}' not found")
        _log_action(current_user, "pdu_breaker", {"branch_id": branch_id, "on": on})
        return {"ok": True, "branch_id": branch_id, "on": on}

    @app.post("/control/fire/reset", status_code=200)
    async def reset_fire_zone(
        body: dict = Body(...),
        current_user: dict = Depends(require_operator),
    ) -> dict:
        zone_id = body.get("zone_id")
        if not isinstance(zone_id, str):
            raise HTTPException(422, "zone_id (str) required")
        if not _sim.reset_fire_zone(zone_id):
            raise HTTPException(404, f"Fire zone '{zone_id}' not found")
        _log_action(current_user, "fire_reset", {"zone_id": zone_id})
        return {"ok": True, "zone_id": zone_id}

    @app.post("/control/access/lock", status_code=200)
    async def set_door_lock(
        body: dict = Body(...),
        current_user: dict = Depends(require_operator),
    ) -> dict:
        door_id = body.get("door_id")
        locked = body.get("locked")
        if not isinstance(door_id, str) or not isinstance(locked, bool):
            raise HTTPException(422, "door_id (str) and locked (bool) required")
        if not _sim.set_door_lock(door_id, locked):
            raise HTTPException(404, f"Door '{door_id}' not found")
        _log_action(current_user, "door_lock", {"door_id": door_id, "locked": locked})
        return {"ok": True, "door_id": door_id, "locked": locked}

    @app.post("/control/cooling/mode", status_code=200)
    async def set_cooling_mode(
        body: dict = Body(...),
        current_user: dict = Depends(require_operator),
    ) -> dict:
        mode = body.get("mode")
        if mode not in ("NORMAL", "ECONOMY", "EMERGENCY"):
            raise HTTPException(422, "mode must be NORMAL | ECONOMY | EMERGENCY")
        _sim.set_cooling_mode(mode)
        _log_action(current_user, "cooling_mode", {"mode": mode})
        return {"ok": True, "mode": mode}

    @app.post("/control/emergency/shutdown", status_code=200)
    async def emergency_shutdown(
        body: dict = Body(...),
        current_user: dict = Depends(require_operator),
    ) -> dict:
        confirm = body.get("confirm")
        if confirm != "SHUTDOWN":
            raise HTTPException(422, 'confirm must equal "SHUTDOWN"')
        _sim.inject_fault("utility_loss")
        _log_action(current_user, "emergency_shutdown", {})
        return {"ok": True, "message": "Emergency shutdown initiated"}

    # ----- Modbus endpoints -----

    @app.get("/modbus/devices")
    async def list_device_profiles() -> dict:
        profiles = load_all_profiles()
        return {
            did: {
                "device_type":     p.get("device_type"),
                "manufacturer":    p.get("manufacturer"),
                "model":           p.get("model"),
                "modbus_slave_id": p.get("modbus", {}).get("slave_id"),
                "register_count":  len(p.get("registers", [])),
            }
            for did, p in profiles.items()
        }

    @app.get("/modbus/registers")
    async def get_modbus_registers() -> dict:
        from modbus_gateway import get_store
        store = get_store()
        out: dict = {}
        for slave_id, name in [(1, "ups-01"), (2, "pdu-a1"), (3, "crah-a"), (4, "generator-01")]:
            try:
                regs = store[slave_id].getValues(3, 0, count=8)
                out[name] = {"slave_id": slave_id, "holding_registers": list(regs)}
            except Exception:
                out[name] = {"slave_id": slave_id, "error": "unavailable"}
        return out

    @app.get("/snmp/status", tags=["hardware"])
    async def snmp_status():
        """Live status of all configured physical SNMP devices."""
        from snmp_poller import get_snmp_status
        return get_snmp_status()

    # ----- users (admin) -----

    import bcrypt as _bcrypt
    import uuid as _uuid
    import time as _time

    _users_store: list[dict] = [
        {
            "id": "u1",
            "name": "Admin User",
            "email": "admin@datacenter.local",
            "role": "ADMIN",
            "status": "active",
            "created_at": 1700000000,
        },
        {
            "id": "u2",
            "name": "Operator User",
            "email": "operator@datacenter.local",
            "role": "OPERATOR",
            "status": "active",
            "created_at": 1700000000,
        },
    ]

    class UserCreate(BaseModel):
        name: str
        email: str
        password: str
        role: str = "OPERATOR"

    @app.get("/users")
    async def list_users(current_user: dict = Depends(require_admin)) -> list[dict]:
        return [
            {k: v for k, v in u.items() if k != "_password_hash"}
            for u in _users_store
        ]

    @app.post("/users", status_code=201)
    async def create_user(
        body: UserCreate,
        current_user: dict = Depends(require_admin),
    ) -> dict:
        if any(u["email"] == body.email for u in _users_store):
            raise HTTPException(status_code=409, detail="Email already in use")
        if body.role not in ("ADMIN", "OPERATOR"):
            raise HTTPException(status_code=422, detail="Role must be ADMIN or OPERATOR")
        user: dict = {
            "id": str(_uuid.uuid4()),
            "name": body.name,
            "email": body.email,
            "role": body.role,
            "status": "active",
            "created_at": int(_time.time()),
            "_password_hash": _bcrypt.hashpw(body.password.encode(), _bcrypt.gensalt()).decode(),
        }
        _users_store.append(user)
        return {k: v for k, v in user.items() if k != "_password_hash"}

    @app.delete("/users/{user_id}", status_code=204)
    async def delete_user(
        user_id: str,
        current_user: dict = Depends(require_admin),
    ) -> None:
        global _users_store
        before = len(_users_store)
        _users_store = [u for u in _users_store if u["id"] != user_id]
        if len(_users_store) == before:
            raise HTTPException(status_code=404, detail="User not found")

    return app


app = create_app()


if __name__ == "__main__":
    current_settings = get_settings()
    uvicorn.run(app, host=current_settings.api_host, port=current_settings.api_port)
