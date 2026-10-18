"""API integration tests using httpx AsyncClient against a real FastAPI instance."""
import os
import sys
import time

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..'))

# Use in-memory SQLite for tests and a known signing secret.
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ["JWT_SECRET"] = "integration-test-secret-0123456789abcdef"

import jwt
from httpx import ASGITransport, AsyncClient

from api_service import _alarm_mgr, _persist_alarm_deltas, _sim, _snapshot_to_dict, app


def _token(role: str, email: str | None = None, secret: str = "integration-test-secret-0123456789abcdef") -> str:
    claims = {
        "email": email or f"{role.lower()}@datacenter.local",
        "role": role,
        "exp": int(time.time()) + 600,
    }
    return jwt.encode(claims, secret, algorithm="HS256")


ADMIN = {"Authorization": f"Bearer {_token('ADMIN', 'admin@datacenter.local')}"}
OPERATOR = {"Authorization": f"Bearer {_token('OPERATOR', 'operator@datacenter.local')}"}


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _init_schema():
    # The ASGI test transport does not run the app's lifespan, so create the
    # database schema (alarms table, etc.) explicitly before any request.
    from database import init_db
    await init_db()
    yield


@pytest_asyncio.fixture(scope="session")
async def client(_init_schema):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# ── Health ────────────────────────────────────────────────────────────────────

@pytest.mark.anyio
async def test_health(client: AsyncClient):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


# ── Auth (B-1) ────────────────────────────────────────────────────────────────

@pytest.mark.anyio
async def test_control_without_token_is_401(client: AsyncClient):
    r = await client.post("/control/cooling/mode", json={"mode": "NORMAL"})
    assert r.status_code == 401


@pytest.mark.anyio
async def test_forged_role_header_is_rejected(client: AsyncClient):
    r = await client.post(
        "/control/cooling/mode",
        json={"mode": "NORMAL"},
        headers={"X-User-Role": "ADMIN", "X-User-Email": "attacker@example.com"},
    )
    assert r.status_code == 401


@pytest.mark.anyio
async def test_token_signed_with_wrong_secret_is_401(client: AsyncClient):
    forged = _token("ADMIN", secret="guessed-secret-0123456789abcdef-xyz")
    r = await client.get("/users", headers={"Authorization": f"Bearer {forged}"})
    assert r.status_code == 401


@pytest.mark.anyio
async def test_operator_cannot_reach_admin_endpoint(client: AsyncClient):
    r = await client.get("/users", headers=OPERATOR)
    assert r.status_code == 403


@pytest.mark.anyio
async def test_operator_can_use_controls(client: AsyncClient):
    r = await client.post("/control/cooling/mode", json={"mode": "NORMAL"}, headers=OPERATOR)
    assert r.status_code == 200


# ── Alarms ────────────────────────────────────────────────────────────────────

@pytest.mark.anyio
async def test_alarms_list_returns_list(client: AsyncClient):
    r = await client.get("/alarms")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


@pytest.mark.anyio
async def test_alarms_state_filter(client: AsyncClient):
    """B-6: each tab only returns alarms in that state."""
    active = _alarm_mgr.raise_alarm(_severity("WARNING"), "test-src-a", "filter test active")
    acked = _alarm_mgr.raise_alarm(_severity("WARNING"), "test-src-b", "filter test acked")
    _alarm_mgr.acknowledge(acked.id, "tester")

    active_rows = (await client.get("/alarms?state=active")).json()
    acked_rows = (await client.get("/alarms?state=acknowledged")).json()
    assert all(a["state"] == "ACTIVE" for a in active_rows)
    assert all(a["state"] == "ACKNOWLEDGED" for a in acked_rows)
    assert active.id in {a["id"] for a in active_rows}
    assert acked.id in {a["id"] for a in acked_rows}
    assert (await client.get("/alarms?state=cleared")).status_code == 422
    _alarm_mgr.clear(active.id)
    _alarm_mgr.clear(acked.id)


@pytest.mark.anyio
async def test_acknowledge_is_persisted_as_acknowledged(client: AsyncClient):
    """B-20: acknowledging must not write the alarm to the database as CLEARED."""
    alarm = _alarm_mgr.raise_alarm(_severity("WARNING"), "test-src-ack", "persist ack test")
    await _persist_alarm_deltas()
    r = await client.post(f"/alarms/{alarm.id}/acknowledge", headers=OPERATOR)
    assert r.status_code == 200
    await _persist_alarm_deltas()
    rows = (await client.get("/alarms/history?limit=500")).json()
    row = next(x for x in rows if x["alarm_id"] == alarm.id)
    assert row["status"] == "ACKNOWLEDGED"
    assert row["acknowledged_at"] is not None
    assert row["cleared_at"] is None

    _alarm_mgr.clear(alarm.id)
    await _persist_alarm_deltas()
    rows = (await client.get("/alarms/history?status=CLEARED&limit=500")).json()
    row = next(x for x in rows if x["alarm_id"] == alarm.id)
    assert row["acknowledged_at"] is not None  # clearing keeps the ack record


@pytest.mark.anyio
async def test_alarms_history_returns_list(client: AsyncClient):
    r = await client.get("/alarms/history")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


@pytest.mark.anyio
async def test_alarms_history_limit(client: AsyncClient):
    r = await client.get("/alarms/history?limit=5")
    assert r.status_code == 200
    assert len(r.json()) <= 5


@pytest.mark.anyio
async def test_thresholds_endpoint(client: AsyncClient):
    r = await client.get("/thresholds")
    assert r.status_code == 200
    assert r.json()["rack_inlet_c"]["warning"] == 27.0


# ── Fault injection (B-2, B-3, B-4) ─────────────────────────────────────────

@pytest.mark.anyio
async def test_fault_requires_admin(client: AsyncClient):
    assert (await client.post("/simulation/fault", json={"fault_type": "utility_loss"})).status_code == 401
    r = await client.post("/simulation/fault", json={"fault_type": "utility_loss"}, headers=OPERATOR)
    assert r.status_code == 403


@pytest.mark.anyio
async def test_inject_valid_fault_expires(client: AsyncClient):
    r = await client.post(
        "/simulation/fault", json={"fault_type": "crah_a_trip", "duration_s": 30}, headers=ADMIN,
    )
    assert r.status_code == 204
    faults = _sim.active_faults()
    assert [f["fault"] for f in faults] == ["crah_a_trip"]
    assert 0 < faults[0]["remaining_s"] <= 30
    assert "active_faults" in _snapshot_to_dict(_sim.tick())
    await client.delete("/simulation/fault", headers=ADMIN)


@pytest.mark.anyio
async def test_fault_duration_is_capped(client: AsyncClient):
    r = await client.post(
        "/simulation/fault", json={"fault_type": "utility_loss", "duration_s": 3600}, headers=ADMIN,
    )
    assert r.status_code == 422


@pytest.mark.anyio
async def test_generator_fail_includes_utility_loss(client: AsyncClient):
    r = await client.post("/simulation/fault", json={"fault_type": "generator_fail"}, headers=ADMIN)
    assert r.status_code == 204
    assert {f["fault"] for f in _sim.active_faults()} == {"generator_fail", "utility_loss"}
    await client.delete("/simulation/fault", headers=ADMIN)


@pytest.mark.anyio
async def test_inject_invalid_fault_422(client: AsyncClient):
    r = await client.post("/simulation/fault", json={"fault_type": "made_up_fault"}, headers=ADMIN)
    assert r.status_code == 422


@pytest.mark.anyio
async def test_clear_faults(client: AsyncClient):
    await client.post("/simulation/fault", json={"fault_type": "utility_loss"}, headers=ADMIN)
    r = await client.delete("/simulation/fault", headers=ADMIN)
    assert r.status_code == 204
    assert _sim.active_faults() == []


# ── Users (B-9, B-10) ────────────────────────────────────────────────────────

@pytest.mark.anyio
async def test_delete_user_works(client: AsyncClient):
    r = await client.post(
        "/users",
        json={"name": "Temp", "email": "temp@datacenter.local", "password": "longpassword", "role": "OPERATOR"},
        headers=ADMIN,
    )
    assert r.status_code == 201
    r = await client.delete(f"/users/{r.json()['id']}", headers=ADMIN)
    assert r.status_code == 204


@pytest.mark.anyio
async def test_builtin_and_self_cannot_be_deleted(client: AsyncClient):
    assert (await client.delete("/users/u1", headers=ADMIN)).status_code == 409   # self
    assert (await client.delete("/users/u2", headers=ADMIN)).status_code == 409   # built-in


# ── Snapshot (B-18) ───────────────────────────────────────────────────────────

def test_hall_names_and_status():
    snap = _snapshot_to_dict(_sim.tick())
    assert [h["name"] for h in snap["halls"]] == ["Data Hall A", "Data Hall B"]
    assert all(h["status"] in ("OK", "WARNING", "CRITICAL") for h in snap["halls"])


# ── Modbus endpoints (B-17) ───────────────────────────────────────────────────

@pytest.mark.anyio
async def test_modbus_devices_returns_dict(client: AsyncClient):
    r = await client.get("/modbus/devices")
    assert r.status_code == 200
    assert isinstance(r.json(), dict)


@pytest.mark.anyio
async def test_modbus_registers_carry_live_values(client: AsyncClient):
    from modbus_gateway import update_registers_from_snapshot
    update_registers_from_snapshot(_sim.tick())
    r = await client.get("/modbus/registers")
    assert r.status_code == 200
    data = r.json()
    assert data["pdu-a1"]["holding_registers"][0] > 0      # PDU kW
    assert data["crah-a"]["holding_registers"][2] > 0      # cooling kW
    assert data["ups-01"]["holding_registers"][2] > 0      # UPS load


def _severity(name: str):
    from alarms import Severity
    return Severity[name]
