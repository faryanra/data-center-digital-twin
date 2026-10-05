"""Small PostgreSQL repository with SQLite support for test isolation."""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from common.settings import Settings


class Database:
    def __init__(self, dsn: str):
        self.dsn = dsn
        self.is_sqlite = dsn.startswith("sqlite://")
        if self.is_sqlite:
            self.sqlite_path = dsn.removeprefix("sqlite:///") if dsn.startswith("sqlite:///") else ":memory:"

    @classmethod
    def from_settings(cls, settings: Settings) -> "Database":
        return cls(settings.postgres_dsn)

    @contextmanager
    def connection(self) -> Iterator[Any]:
        if self.is_sqlite:
            connection = sqlite3.connect(self.sqlite_path)
            connection.row_factory = sqlite3.Row
        else:
            import psycopg

            connection = psycopg.connect(self.dsn)
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def initialize(self) -> None:
        if self.is_sqlite:
            Path(self.sqlite_path).parent.mkdir(parents=True, exist_ok=True) if self.sqlite_path != ":memory:" else None
            statements = SQLITE_SCHEMA
        else:
            statements = POSTGRES_SCHEMA
        with self.connection() as connection:
            cursor = connection.cursor()
            for statement in statements:
                cursor.execute(statement)

    def _query(self, statement: str, values: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        if not self.is_sqlite:
            statement = statement.replace("?", "%s")
        with self.connection() as connection:
            cursor = connection.cursor()
            cursor.execute(statement, values)
            if cursor.description is None:
                return []
            columns = [column[0] for column in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]

    def ensure_device(self, device_id: str, topic: str = "", device_type: str = "unknown") -> dict[str, Any]:
        existing = self.get_device(device_id)
        if existing:
            return existing
        now = datetime.now(timezone.utc).isoformat()
        default_threshold = 28.0 if device_type == "temperature" else 220.0 if device_type == "voltage" else None
        if self.is_sqlite:
            self._query(
                "INSERT OR IGNORE INTO devices (device_id, name, type, building, floor, unit, topic, threshold, enabled, created_at, updated_at) VALUES (?, ?, ?, '', '', '', ?, ?, 1, ?, ?)",
                (device_id, device_id, device_type, topic, default_threshold, now, now),
            )
        else:
            self._query(
                "INSERT INTO devices (device_id, name, type, building, floor, unit, topic, threshold, enabled, created_at, updated_at) VALUES (?, ?, ?, '', '', '', ?, ?, TRUE, NOW(), NOW()) ON CONFLICT (device_id) DO NOTHING",
                (device_id, device_id, device_type, topic, default_threshold),
            )
        return self.get_device(device_id) or {}

    def upsert_device(self, device: dict[str, Any]) -> dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        values = (
            device["device_id"], device.get("name", device["device_id"]), device.get("type", "unknown"),
            device.get("building", ""), device.get("floor", ""), device.get("unit", ""), device.get("topic", ""),
            device.get("threshold"), bool(device.get("enabled", True)), now, now,
        )
        if self.is_sqlite:
            statement = "INSERT INTO devices (device_id, name, type, building, floor, unit, topic, threshold, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(device_id) DO UPDATE SET name=excluded.name, type=excluded.type, building=excluded.building, floor=excluded.floor, unit=excluded.unit, topic=excluded.topic, threshold=excluded.threshold, enabled=excluded.enabled, updated_at=excluded.updated_at"
        else:
            statement = "INSERT INTO devices (device_id, name, type, building, floor, unit, topic, threshold, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW()) ON CONFLICT(device_id) DO UPDATE SET name=EXCLUDED.name, type=EXCLUDED.type, building=EXCLUDED.building, floor=EXCLUDED.floor, unit=EXCLUDED.unit, topic=EXCLUDED.topic, threshold=EXCLUDED.threshold, enabled=EXCLUDED.enabled, updated_at=NOW()"
            values = values[:-2]
        self._query(statement, values)
        return self.get_device(device["device_id"]) or {}

    def get_device(self, device_id: str) -> dict[str, Any] | None:
        rows = self._query("SELECT * FROM devices WHERE device_id = ?", (device_id,))
        return rows[0] if rows else None

    def list_devices(self) -> list[dict[str, Any]]:
        return self._query("SELECT d.*, latest.value AS current_value, latest.timestamp AS last_seen FROM devices d LEFT JOIN telemetry latest ON latest.id = (SELECT t.id FROM telemetry t WHERE t.device_id = d.id ORDER BY t.timestamp DESC LIMIT 1) ORDER BY d.device_id")

    def list_devices_last_seen(self) -> list[dict[str, Any]]:
        return self._query(
            "SELECT d.id, d.device_id, MAX(t.timestamp) AS last_seen "
            "FROM devices d LEFT JOIN telemetry t ON t.device_id = d.id "
            "GROUP BY d.id, d.device_id"
        )

    def insert_telemetry(self, device_db_id: int, value: float, timestamp: datetime) -> dict[str, Any]:
        stamp = timestamp.isoformat()
        if self.is_sqlite:
            self._query("INSERT INTO telemetry (device_id, value, timestamp) VALUES (?, ?, ?)", (device_db_id, value, stamp))
        else:
            self._query("INSERT INTO telemetry (device_id, value, timestamp) VALUES (?, ?, ?)", (device_db_id, value, timestamp))
        return {"device_id": device_db_id, "value": value, "timestamp": stamp}

    def list_telemetry(self, external_device_id: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
        statement = "SELECT t.id, d.device_id, t.value, t.timestamp FROM telemetry t JOIN devices d ON d.id = t.device_id"
        values: tuple[Any, ...] = ()
        if external_device_id:
            statement += " WHERE d.device_id = ?"
            values = (external_device_id,)
        statement += " ORDER BY t.timestamp DESC LIMIT ?"
        return self._query(statement, values + (limit,))

    def active_alert(self, device_db_id: int) -> dict[str, Any] | None:
        rows = self._query("SELECT * FROM alerts WHERE device_id = ? AND status = 'active' ORDER BY timestamp DESC LIMIT 1", (device_db_id,))
        return rows[0] if rows else None

    def create_alert(self, device_db_id: int, value: float, threshold: float, severity: str, message: str, timestamp: datetime) -> dict[str, Any]:
        stamp = timestamp.isoformat()
        self._query("INSERT INTO alerts (device_id, value, threshold, severity, status, timestamp, message) VALUES (?, ?, ?, ?, 'active', ?, ?)", (device_db_id, value, threshold, severity, stamp if self.is_sqlite else timestamp, message))
        rows = self._query("SELECT * FROM alerts WHERE device_id = ? ORDER BY id DESC LIMIT 1", (device_db_id,))
        return rows[0]

    def resolve_alerts(self, device_db_id: int) -> None:
        self._query("UPDATE alerts SET status = 'resolved' WHERE device_id = ? AND status = 'active'", (device_db_id,))

    def list_alerts(self, external_device_id: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
        statement = "SELECT a.id, d.device_id, a.value, a.threshold, a.severity, a.status, a.timestamp, a.message FROM alerts a JOIN devices d ON d.id = a.device_id"
        values: tuple[Any, ...] = ()
        if external_device_id:
            statement += " WHERE d.device_id = ?"
            values = (external_device_id,)
        statement += " ORDER BY a.timestamp DESC LIMIT ?"
        return self._query(statement, values + (limit,))

    def summary(self) -> dict[str, Any]:
        devices = self._query("SELECT COUNT(*) AS count FROM devices")[0]["count"]
        active_alerts = self._query("SELECT COUNT(*) AS count FROM alerts WHERE status = 'active'")[0]["count"]
        latest = self.list_telemetry(limit=10)
        return {"total_devices": devices, "active_alerts": active_alerts, "latest_telemetry": latest}


SQLITE_SCHEMA = (
    "CREATE TABLE IF NOT EXISTS devices (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, type TEXT NOT NULL, building TEXT, floor TEXT, unit TEXT, topic TEXT, threshold REAL, enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS telemetry (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id INTEGER NOT NULL REFERENCES devices(id), value REAL NOT NULL, timestamp TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id INTEGER NOT NULL REFERENCES devices(id), value REAL NOT NULL, threshold REAL NOT NULL, severity TEXT NOT NULL, status TEXT NOT NULL, timestamp TEXT NOT NULL, message TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_devices_device_id ON devices(device_id)",
    "CREATE INDEX IF NOT EXISTS idx_telemetry_device_timestamp ON telemetry(device_id, timestamp DESC)",
    "CREATE INDEX IF NOT EXISTS idx_alerts_device_timestamp ON alerts(device_id, timestamp DESC)",
)

POSTGRES_SCHEMA = (
    "CREATE TABLE IF NOT EXISTS devices (id BIGSERIAL PRIMARY KEY, device_id VARCHAR(255) NOT NULL UNIQUE, name VARCHAR(255) NOT NULL, type VARCHAR(100) NOT NULL, building VARCHAR(100), floor VARCHAR(100), unit VARCHAR(100), topic VARCHAR(255), threshold DOUBLE PRECISION, enabled BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    "CREATE TABLE IF NOT EXISTS telemetry (id BIGSERIAL PRIMARY KEY, device_id BIGINT NOT NULL REFERENCES devices(id), value DOUBLE PRECISION NOT NULL, timestamp TIMESTAMPTZ NOT NULL)",
    "CREATE TABLE IF NOT EXISTS alerts (id BIGSERIAL PRIMARY KEY, device_id BIGINT NOT NULL REFERENCES devices(id), value DOUBLE PRECISION NOT NULL, threshold DOUBLE PRECISION NOT NULL, severity VARCHAR(32) NOT NULL, status VARCHAR(32) NOT NULL, timestamp TIMESTAMPTZ NOT NULL, message TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_devices_device_id ON devices(device_id)",
    "CREATE INDEX IF NOT EXISTS idx_telemetry_device_timestamp ON telemetry(device_id, timestamp DESC)",
    "CREATE INDEX IF NOT EXISTS idx_alerts_device_timestamp ON alerts(device_id, timestamp DESC)",
)
