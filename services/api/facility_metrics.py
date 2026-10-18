"""Prometheus gauges for the simulated facility, refreshed on every sim tick.

These back the Grafana dashboard in infrastructure/docker/monitoring.
"""

from __future__ import annotations

from prometheus_client import Gauge

pue = Gauge("dc_pue", "Power usage effectiveness")
it_load_kw = Gauge("dc_it_load_kw", "IT load in kW")
total_power_kw = Gauge("dc_total_power_kw", "Total facility power in kW")
cooling_power_kw = Gauge("dc_cooling_power_kw", "Cooling plant power in kW")
crah_setpoint_c = Gauge("dc_crah_setpoint_celsius", "CRAH supply-air setpoint")
hall_inlet_c = Gauge("dc_hall_avg_inlet_celsius", "Average rack inlet temperature per hall", ["hall"])
rack_inlet_c = Gauge("dc_rack_inlet_celsius", "Rack inlet temperature", ["rack"])
pdu_load_pct = Gauge("dc_pdu_load_percent", "PDU load as a percentage of its rating", ["pdu"])
ups_load_pct = Gauge("dc_ups_load_percent", "UPS load percentage")
ups_battery_pct = Gauge("dc_ups_battery_percent", "UPS battery state of charge")
utility_online = Gauge("dc_utility_online", "1 when the utility feed is live")
power_source = Gauge("dc_power_source", "1 for the source currently carrying the load", ["source"])
generator_state = Gauge("dc_generator_state", "1 for the current generator state", ["state"])
alarms_active = Gauge("dc_alarms_active", "Active (unacknowledged) alarms", ["severity"])
active_faults = Gauge("dc_active_faults", "Injected faults currently active")

_SOURCES = ("UTILITY", "GENERATOR", "BATTERY")
_GEN_STATES = ("STANDBY", "STARTING", "TRANSFERRED", "RECOVERY", "FAULT")
_SEVERITIES = ("CRITICAL", "WARNING", "INFO")


def update(snap, alarm_manager) -> None:
    pue.set(snap.pue)
    it_load_kw.set(snap.it_load_w / 1000)
    total_power_kw.set(snap.total_facility_power_w / 1000)
    cooling_power_kw.set(snap.cooling.cooling_power_w / 1000)
    crah_setpoint_c.set(snap.crah_setpoint_c)
    for pdu in snap.pdus:
        racks = pdu.racks
        if racks:
            hall_inlet_c.labels(hall=pdu.location).set(sum(r.inlet_temp_c for r in racks) / len(racks))
        for rack in racks:
            rack_inlet_c.labels(rack=rack.id).set(rack.inlet_temp_c)
        pdu_load_pct.labels(pdu=pdu.id).set(pdu.load_factor * 100)
    ups_load_pct.set(snap.ups.load_percent)
    ups_battery_pct.set(snap.ups.battery_soc * 100)
    utility_online.set(1 if snap.utility_online else 0)
    for source in _SOURCES:
        power_source.labels(source=source).set(1 if snap.power_source == source else 0)
    for state in _GEN_STATES:
        generator_state.labels(state=state).set(1 if snap.generator_state == state else 0)
    counts = dict.fromkeys(_SEVERITIES, 0)
    for alarm in alarm_manager.list_active():
        counts[alarm.severity.value] = counts.get(alarm.severity.value, 0) + 1
    for severity, count in counts.items():
        alarms_active.labels(severity=severity).set(count)
    active_faults.set(len(snap.active_faults))
