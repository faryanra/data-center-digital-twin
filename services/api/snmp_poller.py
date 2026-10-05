"""SNMP poller for physical hardware: APC/Eaton/Schneider UPS and PDU."""

from __future__ import annotations

import asyncio
import json
import logging
import os

LOG = logging.getLogger(__name__)

# Standard UPS MIB OIDs (RFC 1628 + APC extension)
UPS_OIDS = {
    "input_voltage":     "1.3.6.1.2.1.33.1.3.3.1.3.1",   # upsInputVoltage
    "output_voltage":    "1.3.6.1.2.1.33.1.4.4.1.2.1",   # upsOutputVoltage
    "output_load_pct":   "1.3.6.1.2.1.33.1.4.4.1.5.1",   # upsOutputPercentLoad
    "battery_charge":    "1.3.6.1.2.1.33.1.2.4.0",        # upsBatteryCapacity
    "battery_status":    "1.3.6.1.2.1.33.1.2.1.0",        # upsBatteryStatus
    "runtime_remaining": "1.3.6.1.2.1.33.1.2.3.0",        # upsEstimatedMinutesRemaining
    "input_freq":        "1.3.6.1.2.1.33.1.3.3.1.2.1",   # upsInputFrequency
}

# APC PDU MIB OIDs (AP7900 series)
PDU_OIDS = {
    "total_load_w":  "1.3.6.1.4.1.318.1.1.12.2.3.1.1.2.1",  # sPDUMasterStatusLoad
    "phase_a_load":  "1.3.6.1.4.1.318.1.1.12.2.3.1.1.2.1",
}


class SnmpDevice:
    def __init__(self, host: str, community: str, device_type: str, device_id: str) -> None:
        self.host = host
        self.community = community
        self.device_type = device_type
        self.device_id = device_id
        self.last_values: dict = {}
        self.error: str | None = None

    async def poll(self) -> dict:
        try:
            from puresnmp import Client, V2C  # deferred — optional dependency
        except ImportError:
            self.error = "puresnmp not installed"
            return self.last_values

        oids = UPS_OIDS if self.device_type == "ups" else PDU_OIDS
        try:
            client = Client(self.host, V2C(self.community))
            results: dict = {}
            for name, oid in oids.items():
                try:
                    val = await client.get(oid)
                    results[name] = int(val) if val is not None else None
                except Exception:
                    results[name] = None
            self.last_values = results
            self.error = None
            LOG.debug("SNMP poll OK: %s (%s)", self.device_id, self.host)
        except Exception as exc:
            self.error = str(exc)
            LOG.warning("SNMP poll failed for %s: %s", self.device_id, exc)
        return self.last_values


_devices: list[SnmpDevice] = []


def init_snmp_devices() -> None:
    """Called at startup — reads SNMP_DEVICES_JSON env var."""
    raw = os.getenv("SNMP_DEVICES_JSON", "").strip()
    if not raw or raw in ("[]", ""):
        LOG.info("SNMP_DEVICES_JSON not set — no physical devices configured")
        return
    try:
        device_list = json.loads(raw)
    except json.JSONDecodeError as exc:
        LOG.error("SNMP_DEVICES_JSON is not valid JSON: %s", exc)
        return
    for d in device_list:
        _devices.append(SnmpDevice(
            host=d["host"],
            community=d.get("community", "public"),
            device_type=d["type"],   # "ups" | "pdu"
            device_id=d["id"],
        ))
    LOG.info("Registered %d SNMP device(s)", len(_devices))


async def poll_loop(interval: int = 30) -> None:
    """Background task: poll all SNMP devices every `interval` seconds."""
    while True:
        for dev in _devices:
            try:
                await dev.poll()
            except Exception:
                LOG.warning("Unexpected error polling %s", dev.device_id, exc_info=True)
        await asyncio.sleep(interval)


def get_snmp_status() -> list[dict]:
    return [
        {
            "id": d.device_id,
            "host": d.host,
            "type": d.device_type,
            "values": d.last_values,
            "error": d.error,
        }
        for d in _devices
    ]
