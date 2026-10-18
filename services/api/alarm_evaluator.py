"""
Threshold checks against FacilitySnapshot. Called each sim tick.
Raises or auto-clears alarms via AlarmManager.

THRESHOLDS is the single source of truth for alarm limits: the evaluator, the
hall status in the WebSocket snapshot and GET /thresholds all read it.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from simulation.electrical.facility_sim import (
    HALL_COOLING_NOMINAL_KW,
    RACK_INLET_CRITICAL_C,
    RACK_INLET_WARN_C,
    ZONE_TEMP_CRITICAL_C,
    ZONE_TEMP_WARN_C,
)

from alarms import AlarmManager, Severity

RACK_WARN_C   = RACK_INLET_WARN_C
RACK_CRIT_C   = RACK_INLET_CRITICAL_C
PDU_LOAD_WARN = 75.0
PDU_LOAD_CRIT = 90.0
UPS_LOAD_WARN = 75.0
UPS_LOAD_CRIT = 90.0
UPS_BATT_WARN = 30.0
PUE_WARN      = 2.0
CRAH_MIN_FRAC = 0.75

THRESHOLDS: dict[str, dict] = {
    "rack_inlet_c":    {"label": "Rack inlet temperature", "unit": "°C", "warning": RACK_WARN_C, "critical": RACK_CRIT_C},
    "zone_temp_c":     {"label": "Room temperature",       "unit": "°C", "warning": ZONE_TEMP_WARN_C, "critical": ZONE_TEMP_CRITICAL_C},
    "pdu_load_pct":    {"label": "PDU load",               "unit": "%",  "warning": PDU_LOAD_WARN, "critical": PDU_LOAD_CRIT},
    "ups_load_pct":    {"label": "UPS load",               "unit": "%",  "warning": UPS_LOAD_WARN, "critical": UPS_LOAD_CRIT},
    "ups_battery_pct": {"label": "UPS battery (below)",    "unit": "%",  "warning": UPS_BATT_WARN, "critical": None},
    "pue":             {"label": "PUE",                    "unit": "",   "warning": PUE_WARN, "critical": None},
    "crah_online_pct": {"label": "CRAH units online (below)", "unit": "%", "warning": CRAH_MIN_FRAC * 100, "critical": None},
}


def evaluate(snapshot, manager: AlarmManager) -> None:
    _racks(snapshot, manager)
    _pdus(snapshot, manager)
    _ups(snapshot, manager)
    _cooling(snapshot, manager)
    _utility(snapshot, manager)
    _generator(snapshot, manager)
    _pue(snapshot, manager)


def hall_status(pdu, snapshot) -> str:
    """Worst condition in a hall: rack inlet, PDU load or degraded cooling."""
    status = "OK"
    for rack in pdu.racks:
        if rack.inlet_temp_c >= RACK_CRIT_C:
            return "CRITICAL"
        if rack.inlet_temp_c >= RACK_WARN_C:
            status = "WARNING"
    load_pct = pdu.load_factor * 100
    if load_pct >= PDU_LOAD_CRIT:
        return "CRITICAL"
    if load_pct >= PDU_LOAD_WARN:
        status = "WARNING"
    hall_key = pdu.location.replace("-", "_")
    if snapshot.per_hall_cooling_kw.get(hall_key, HALL_COOLING_NOMINAL_KW) < HALL_COOLING_NOMINAL_KW:
        status = "WARNING"
    return status


def _racks(snap, mgr: AlarmManager) -> None:
    for pdu in snap.pdus:
        for rack in pdu.racks:
            crit_msg = "Rack inlet temperature critical"
            warn_msg = "Rack inlet temperature elevated"
            if rack.inlet_temp_c >= RACK_CRIT_C:
                mgr.raise_alarm(Severity.CRITICAL, rack.id, crit_msg)
            else:
                mgr.auto_clear(rack.id, crit_msg)
            if RACK_WARN_C <= rack.inlet_temp_c < RACK_CRIT_C:
                mgr.raise_alarm(Severity.WARNING, rack.id, warn_msg)
            else:
                mgr.auto_clear(rack.id, warn_msg)

            over_msg = "Rack power above rated capacity"
            if rack.load_factor > 1.0:
                mgr.raise_alarm(Severity.WARNING, rack.id, over_msg)
            else:
                mgr.auto_clear(rack.id, over_msg)


def _pdus(snap, mgr: AlarmManager) -> None:
    for pdu in snap.pdus:
        load_pct = pdu.load_factor * 100
        crit_msg = "PDU load critical — breaker trip risk"
        warn_msg = "PDU load elevated"
        if load_pct >= PDU_LOAD_CRIT:
            mgr.raise_alarm(Severity.CRITICAL, pdu.id, crit_msg)
        else:
            mgr.auto_clear(pdu.id, crit_msg)
        if PDU_LOAD_WARN <= load_pct < PDU_LOAD_CRIT:
            mgr.raise_alarm(Severity.WARNING, pdu.id, warn_msg)
        else:
            mgr.auto_clear(pdu.id, warn_msg)


def _ups(snap, mgr: AlarmManager) -> None:
    ups = snap.ups
    if ups.load_percent >= UPS_LOAD_CRIT:
        mgr.raise_alarm(Severity.CRITICAL, ups.id, "UPS overload — critical")
    else:
        mgr.auto_clear(ups.id, "UPS overload — critical")
    if UPS_LOAD_WARN <= ups.load_percent < UPS_LOAD_CRIT:
        mgr.raise_alarm(Severity.WARNING, ups.id, "UPS load elevated")
    else:
        mgr.auto_clear(ups.id, "UPS load elevated")
    if ups.mode == "BATTERY":
        mgr.raise_alarm(Severity.CRITICAL, ups.id, "UPS on battery — utility loss")
    else:
        mgr.auto_clear(ups.id, "UPS on battery — utility loss")
    if ups.battery_soc <= UPS_BATT_WARN / 100:
        mgr.raise_alarm(Severity.WARNING, ups.id, "UPS battery low")
    else:
        mgr.auto_clear(ups.id, "UPS battery low")


def _cooling(snap, mgr: AlarmManager) -> None:
    frac = snap.cooling.crah_online_count / max(snap.cooling.crah_total_count, 1)
    msg = "Cooling capacity reduced — CRAH unit offline"
    if frac < CRAH_MIN_FRAC:
        mgr.raise_alarm(Severity.WARNING, "crah", msg)
    else:
        mgr.auto_clear("crah", msg)


def _utility(snap, mgr: AlarmManager) -> None:
    msg = "Utility power failure"
    if not snap.utility_online:
        mgr.raise_alarm(Severity.CRITICAL, "utility", msg)
    else:
        mgr.auto_clear("utility", msg)


def _generator(snap, mgr: AlarmManager) -> None:
    msg = "Generator failed to start — load on battery"
    if snap.generator_state == "FAULT":
        mgr.raise_alarm(Severity.CRITICAL, "generator-01", msg)
    else:
        mgr.auto_clear("generator-01", msg)


def _pue(snap, mgr: AlarmManager) -> None:
    msg = "PUE above efficiency threshold"
    if snap.pue > PUE_WARN:
        mgr.raise_alarm(Severity.WARNING, "facility", msg)
    else:
        mgr.auto_clear("facility", msg)
