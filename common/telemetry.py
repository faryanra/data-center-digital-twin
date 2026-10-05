"""Compatibility parser for the simulator's SenML and legacy alert payloads."""

from __future__ import annotations

import json
import math
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


UNIT_TO_TYPE: dict[str, str] = {
    "Cel": "temperature",
    "V": "voltage",
    "A": "current",
    "W": "power",
    "kW": "power",
    "kWh": "energy",
    "pf": "power_factor",
    "Hz": "frequency",
}


@dataclass(frozen=True)
class TelemetryReading:
    device_id: str
    value: float
    timestamp: datetime
    metric_type: str = "unknown"


class PayloadError(ValueError):
    pass


def _timestamp(value: Any) -> datetime:
    if value in (None, 0, ""):
        return datetime.now(timezone.utc)
    try:
        return datetime.fromtimestamp(float(value), tz=timezone.utc)
    except (TypeError, ValueError, OSError) as exc:
        raise PayloadError("timestamp must be a Unix timestamp") from exc


def _device_id(base_name: Any) -> str:
    if not isinstance(base_name, str) or not base_name.strip():
        raise PayloadError("bn must identify a device")
    return base_name.rstrip("/").split("/")[-1]


def parse_telemetry(payload: bytes | str | dict[str, Any]) -> TelemetryReading:
    """Normalize the existing SenML messages and legacy alert-shaped messages."""
    if isinstance(payload, bytes):
        payload = payload.decode("utf-8")
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError as exc:
            raise PayloadError("payload must be valid JSON") from exc
    if not isinstance(payload, dict):
        raise PayloadError("payload must be an object")

    metric_type = "unknown"
    if "bn" in payload and "e" in payload:
        entries = payload["e"]
        if not isinstance(entries, list) or not entries or not isinstance(entries[0], dict):
            raise PayloadError("SenML e must contain an entry")
        entry = entries[0]  # only the first entry is processed; multi-entry packs are not supported
        device_id, value, timestamp = _device_id(payload["bn"]), entry.get("v"), entry.get("t")
        metric_type = UNIT_TO_TYPE.get(entry.get("u", ""), "unknown")
    elif "sensorId" in payload and "value" in payload:
        device_id, value, timestamp = payload["sensorId"], payload["value"], payload.get("ts", time.time())
    else:
        raise PayloadError("unsupported telemetry payload")

    if not isinstance(device_id, str) or not device_id.strip():
        raise PayloadError("device_id is required")
    try:
        numeric_value = float(value)
    except (TypeError, ValueError) as exc:
        raise PayloadError("value must be numeric") from exc
    if not math.isfinite(numeric_value):
        raise PayloadError("value must be a finite number")
    return TelemetryReading(device_id=device_id.strip(), value=numeric_value, timestamp=_timestamp(timestamp), metric_type=metric_type)
