"""
Loads device register profiles from YAML files in config/device_profiles/.
Provides register metadata and threshold validation for Modbus register values.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

_PROFILES_DIR = Path(__file__).parent.parent.parent / "config" / "device_profiles"
_cache: dict[str, dict] | None = None


def load_all_profiles(force: bool = False) -> dict[str, dict]:
    global _cache
    if _cache is not None and not force:
        return _cache
    profiles: dict[str, dict] = {}
    if not _PROFILES_DIR.is_dir():
        return profiles
    for path in _PROFILES_DIR.glob("*.yaml"):
        with open(path, encoding="utf-8") as f:
            data = yaml.safe_load(f)
        device_id = data.get("device_id", path.stem)
        profiles[device_id] = data
    _cache = profiles
    return profiles


def get_register_metadata(device_id: str, register_name: str) -> dict | None:
    profiles = load_all_profiles()
    device = profiles.get(device_id, {})
    for reg in device.get("registers", []):
        if reg["name"] == register_name:
            return reg
    return None


def validate_register_value(
    device_id: str, register_name: str, raw_value: int
) -> dict[str, Any]:
    """Validate a raw Modbus register value against YAML profile thresholds."""
    meta = get_register_metadata(device_id, register_name)
    if not meta:
        return {"value": raw_value, "status": "UNKNOWN"}

    scale = meta.get("scale", 1)
    scaled = round(raw_value * scale, 2)
    unit = meta.get("unit", "")
    status = "OK"

    if "alarm_critical" in meta and scaled >= meta["alarm_critical"]:
        status = "CRITICAL"
    elif "alarm_high" in meta and scaled >= meta["alarm_high"] or "alarm_low" in meta and scaled <= meta["alarm_low"]:
        status = "WARNING"

    result: dict[str, Any] = {"value": scaled, "unit": unit, "status": status}
    enum_map = meta.get("enum_map", {})
    if enum_map:
        result["label"] = enum_map.get(int(raw_value), "UNKNOWN")
    return result
