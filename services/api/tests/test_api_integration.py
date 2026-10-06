"""API integration tests using httpx AsyncClient against a real FastAPI instance."""
import os
import sys

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..'))

# Use in-memory SQLite for tests
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")

from httpx import ASGITransport, AsyncClient

from api_service import app


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


# ── Alarms ────────────────────────────────────────────────────────────────────

@pytest.mark.anyio
async def test_alarms_list_returns_list(client: AsyncClient):
    r = await client.get("/alarms")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


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


# ── Fault injection ───────────────────────────────────────────────────────────

@pytest.mark.anyio
async def test_inject_valid_fault(client: AsyncClient):
    r = await client.post("/simulation/fault", json={"fault_type": "utility_loss"})
    assert r.status_code == 204


@pytest.mark.anyio
async def test_inject_invalid_fault_422(client: AsyncClient):
    r = await client.post("/simulation/fault", json={"fault_type": "made_up_fault"})
    assert r.status_code == 422


@pytest.mark.anyio
async def test_clear_faults(client: AsyncClient):
    await client.post("/simulation/fault", json={"fault_type": "utility_loss"})
    r = await client.delete("/simulation/fault")
    assert r.status_code == 204


# ── Modbus endpoints ──────────────────────────────────────────────────────────

@pytest.mark.anyio
async def test_modbus_devices_returns_dict(client: AsyncClient):
    r = await client.get("/modbus/devices")
    assert r.status_code == 200
    assert isinstance(r.json(), dict)


@pytest.mark.anyio
async def test_modbus_registers_returns_dict(client: AsyncClient):
    r = await client.get("/modbus/registers")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, dict)
    assert "ups-01" in data
