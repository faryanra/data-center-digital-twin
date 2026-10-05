"""
Threshold checks against FacilitySnapshot. Called each sim tick.
Raises or auto-clears alarms via AlarmManager.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from alarms import AlarmManager, Severity

RACK_WARN_C   = 27.0
RACK_CRIT_C   = 35.0
UPS_LOAD_WARN = 75.0
UPS_LOAD_CRIT = 90.0
UPS_BATT_WARN = 30.0
PUE_WARN      = 2.0
CRAH_MIN_FRAC = 0.75


def evaluate(snapshot, manager: AlarmManager) -> None:
    _racks(snapshot, manager)
    _ups(snapshot, manager)
    _cooling(snapshot, manager)
    _utility(snapshot, manager)
    _pue(snapshot, manager)


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


def _pue(snap, mgr: AlarmManager) -> None:
    msg = "PUE above efficiency threshold"
    if snap.pue > PUE_WARN:
        mgr.raise_alarm(Severity.WARNING, "facility", msg)
    else:
        mgr.auto_clear("facility", msg)
