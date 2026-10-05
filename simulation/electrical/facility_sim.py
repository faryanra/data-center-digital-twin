"""
Facility simulation engine.

Each tick() call advances the simulation by one step and returns
a FacilitySnapshot. Callers (Modbus server, API) read this snapshot.

Design rules:
- No randomness in steady state — drift is small and deterministic-ish
- Faults are injected explicitly via inject_fault() / clear_fault()
- All state is in-memory; persistence is the caller's concern
"""

from __future__ import annotations
import math
import random
import time
from typing import Optional

from simulation.electrical.models import (
    RackState, PDUState, UPSState, CoolingLoad,
    FacilitySnapshot, ThreePhaseReading,
    FireZone, FireSafetyState, Door, AccessControlState,
    EnvZone, EnvironmentState, BranchCircuit, PowerDistributionState,
)

# ASHRAE A1 class recommended envelope
RACK_INLET_WARN_C = 27.0
RACK_INLET_CRITICAL_C = 35.0
RACK_INLET_AMBIENT_C = 22.0  # baseline cold-aisle temperature


class FacilitySimulator:
    """
    Simulates DC-NORTH-01 — Level 0 electrical + Level 1 data halls.
    Thread-safe for read (snapshot is replaced atomically each tick).
    """

    def __init__(self) -> None:
        self._tick: int = 0
        self._snapshot: Optional[FacilitySnapshot] = None
        self._faults: set[str] = set()
        self._state = self._build_initial_state()
        self._gen_state: str = "STANDBY"
        self._gen_state_entered_at: float = 0.0
        self._hall_cooling: dict[str, float] = {"data_hall_a": 500.0, "data_hall_b": 500.0}
        self._crah_setpoint_c: float = 22.0

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def tick(self) -> FacilitySnapshot:
        """Advance simulation one step. Returns updated snapshot."""
        self._tick_generator(time.time())
        self._tick += 1
        self._evolve_loads()
        self._apply_thermal_model()
        self._apply_electrical_model()
        self._tick_fire_safety()
        self._tick_environment()
        self._tick_power_distribution()
        self._snapshot = self._build_snapshot()
        return self._snapshot

    @property
    def snapshot(self) -> Optional[FacilitySnapshot]:
        return self._snapshot

    def inject_fault(self, fault: str) -> None:
        """
        Supported faults:
          utility_loss    — grid goes down, UPS switches to battery
          crah_a_trip     — CRAH-A01 offline, Data Hall A cooling degrades
          rack_overload   — Rack A07 load jumps to 95%
          generator_fail  — generator won't start during utility_loss
        """
        self._faults.add(fault)

    def clear_fault(self, fault: str) -> None:
        self._faults.discard(fault)

    def clear_faults(self) -> None:
        self._faults.clear()

    def get_snapshot(self) -> FacilitySnapshot:
        if self._snapshot is None:
            return self.tick()
        return self._snapshot

    def get_rack(self, rack_id: str) -> Optional[RackState]:
        for pdu in self._state["pdus"]:
            for rack in pdu.racks:
                if rack.id == rack_id:
                    return rack
        return None

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _tick_generator(self, now: float) -> None:
        utility_lost = "utility_loss" in self._faults
        gen_fail     = "generator_fail" in self._faults
        elapsed      = now - self._gen_state_entered_at

        if self._gen_state == "STANDBY":
            if utility_lost and not gen_fail:
                self._gen_state = "STARTING"
                self._gen_state_entered_at = now

        elif self._gen_state == "STARTING":
            if gen_fail or not utility_lost:
                self._gen_state = "STANDBY"
                self._gen_state_entered_at = now
            elif elapsed >= 5.0:
                self._gen_state = "TRANSFERRED"
                self._gen_state_entered_at = now

        elif self._gen_state == "TRANSFERRED":
            if gen_fail:
                self._gen_state = "STANDBY"
                self._gen_state_entered_at = now
            elif not utility_lost:
                self._gen_state = "RECOVERY"
                self._gen_state_entered_at = now

        elif self._gen_state == "RECOVERY":
            if utility_lost:
                self._gen_state = "STARTING"
                self._gen_state_entered_at = now
            elif elapsed >= 3.0:
                self._gen_state = "STANDBY"
                self._gen_state_entered_at = now

    def _build_initial_state(self) -> dict:
        racks_a = [
            RackState(
                id=f"rack-a{i:02d}",
                location="data-hall-a",
                rated_power_w=10_000,
                load_factor=random.uniform(0.55, 0.75),
                inlet_temp_c=RACK_INLET_AMBIENT_C,
                outlet_temp_c=RACK_INLET_AMBIENT_C + 10,
            )
            for i in range(1, 11)
        ]
        racks_b = [
            RackState(
                id=f"rack-b{i:02d}",
                location="data-hall-b",
                rated_power_w=10_000,
                load_factor=random.uniform(0.50, 0.70),
                inlet_temp_c=RACK_INLET_AMBIENT_C,
                outlet_temp_c=RACK_INLET_AMBIENT_C + 10,
            )
            for i in range(1, 9)
        ]

        pdu_a = PDUState(id="pdu-a01", location="data-hall-a",
                         rated_power_w=120_000, racks=racks_a)
        pdu_b = PDUState(id="pdu-b01", location="data-hall-b",
                         rated_power_w=100_000, racks=racks_b)

        ups = UPSState(id="ups-01", rated_kva=800, rated_kw=720)
        cooling = CoolingLoad(crah_online_count=4, crah_total_count=4)

        fire_safety = FireSafetyState(
            zones=[
                FireZone(id="fz-elec-room", name="Electrical Room", heat_c=23.0),
                FireZone(id="fz-hall-a",    name="Data Hall A",      heat_c=22.0),
                FireZone(id="fz-hall-b",    name="Data Hall B",      heat_c=22.0),
                FireZone(id="fz-cooling",   name="Cooling Plant",    heat_c=21.0),
            ],
            system_armed=True,
        )

        access_control = AccessControlState(
            doors=[
                Door(id="door-main-entry",  location="Main Entry",       locked=True),
                Door(id="door-hall-a",      location="Data Hall A",      locked=True,  badge_required=True),
                Door(id="door-hall-b",      location="Data Hall B",      locked=True,  badge_required=True),
                Door(id="door-elec-room",   location="Electrical Room",  locked=True,  badge_required=True),
                Door(id="door-noc",         location="NOC",              locked=False, badge_required=False),
            ],
        )

        environment = EnvironmentState(
            zones=[
                EnvZone(id="env-hall-a",  location="Data Hall A",     temp_c=22.0, humidity_pct=45.0, airflow_mps=1.8),
                EnvZone(id="env-hall-b",  location="Data Hall B",     temp_c=22.0, humidity_pct=44.0, airflow_mps=1.6),
                EnvZone(id="env-elec",    location="Electrical Room", temp_c=24.0, humidity_pct=40.0, airflow_mps=0.8),
                EnvZone(id="env-noc",     location="NOC",             temp_c=21.0, humidity_pct=47.0, airflow_mps=1.0),
            ],
        )

        power_distribution = PowerDistributionState(
            bus_voltage_v=400.0,
            bus_frequency_hz=50.0,
            branches=[
                BranchCircuit(id="bc-hall-a-main", label="Hall A Main",      phase="A", amps=200.0, volts=230.0),
                BranchCircuit(id="bc-hall-b-main", label="Hall B Main",      phase="B", amps=160.0, volts=230.0),
                BranchCircuit(id="bc-cooling",     label="Cooling Plant",    phase="C", amps=85.0,  volts=230.0),
                BranchCircuit(id="bc-lighting",    label="Lighting",         phase="A", amps=12.0,  volts=230.0),
                BranchCircuit(id="bc-noc",         label="NOC",              phase="B", amps=20.0,  volts=230.0),
                BranchCircuit(id="bc-security",    label="Security Systems", phase="C", amps=8.0,   volts=230.0),
            ],
        )

        return {
            "ups": ups, "pdus": [pdu_a, pdu_b], "cooling": cooling,
            "fire_safety": fire_safety, "access_control": access_control,
            "environment": environment, "power_distribution": power_distribution,
            "crah_setpoint_c": 22.0, "ups_bypass_enabled": False, "gen_auto_start": True,
        }

    def _evolve_loads(self) -> None:
        """Small load drift each tick — simulates workload variation."""
        for pdu in self._state["pdus"]:
            for rack in pdu.racks:
                if rack.status == "OFFLINE":
                    continue
                drift = random.gauss(0, 0.005)   # σ = 0.5% per tick
                rack.load_factor = max(0.1, min(0.95,
                                                rack.load_factor + drift))

        # Fault: rack overload
        if "rack_overload" in self._faults:
            rack = self.get_rack("rack-a07")
            if rack:
                rack.load_factor = min(0.95, rack.load_factor + 0.02)

    def _apply_thermal_model(self) -> None:
        """
        Simplified thermal model with per-hall cooling isolation.
        - Inlet temperature rises when cooling capacity is reduced.
        - Uses a first-order lag: temp moves toward target over time.
        """
        cooling = self._state["cooling"]

        # Per-hall cooling capacity (kW)
        hall_cooling: dict[str, float] = {
            "data_hall_a": 500.0,
            "data_hall_b": 500.0,
        }
        if "crah_a_trip" in self._faults:
            hall_cooling["data_hall_a"] *= 0.20   # one CRAH offline — 80% capacity loss
        total_cooling_kw = sum(hall_cooling.values())
        self._hall_cooling = hall_cooling

        # Global CRAH count for legacy CoolingLoad fields
        if "crah_a_trip" in self._faults:
            cooling.crah_online_count = max(0, 4 - 2)
        else:
            cooling.crah_online_count = 4

        for pdu in self._state["pdus"]:
            hall_key = pdu.location.replace("-", "_")  # "data-hall-a" → "data_hall_a"
            hall_cap_kw = hall_cooling.get(hall_key, 500.0)
            capacity_factor = hall_cap_kw / 500.0

            hall_heat_w = sum(r.heat_output_w for r in pdu.racks
                              if r.status != "OFFLINE")

            base_temp = RACK_INLET_AMBIENT_C
            load_contribution = (hall_heat_w / 100_000) * 8
            cooling_factor = 1.0 if capacity_factor >= 1.0 else (
                1.0 + (1.0 - capacity_factor) * 2.5
            )
            target_inlet = base_temp + load_contribution * cooling_factor

            for rack in pdu.racks:
                if rack.status == "OFFLINE":
                    continue
                rack.inlet_temp_c += (target_inlet - rack.inlet_temp_c) * 0.2
                rack.outlet_temp_c = rack.inlet_temp_c + (
                    rack.heat_output_w / 500
                )

                if rack.inlet_temp_c >= RACK_INLET_CRITICAL_C:
                    rack.status = "CRITICAL"
                elif rack.inlet_temp_c >= RACK_INLET_WARN_C:
                    rack.status = "WARNING"
                else:
                    rack.status = "ONLINE"

        # Cooling power: roughly 40% of IT heat (COP ~2.5)
        global_cap_factor = cooling.crah_online_count / cooling.crah_total_count
        total_heat = sum(
            r.heat_output_w
            for pdu in self._state["pdus"]
            for r in pdu.racks
            if r.status != "OFFLINE"
        )
        cooling.total_it_heat_w = total_heat
        cooling.cooling_power_w = total_heat * 0.40 * (
            1.0 + (1.0 - global_cap_factor) * 0.3
        )
        cooling.supply_temp_c = 18.0
        cooling.return_temp_c = 18.0 + (total_heat / 150_000) * 15

    def _apply_electrical_model(self) -> None:
        """
        Power flow: UPS output = sum of PDU inputs.
        UPS input = output / efficiency (when on utility).
        """
        ups = self._state["ups"]
        total_pdu_input = sum(p.input_power_w for p in self._state["pdus"])
        ups.output_load_w = total_pdu_input

        # Voltage and frequency: nominal with small noise
        ups.output_voltage_v = 400.0 + random.gauss(0, 0.3)
        ups.frequency_hz = 50.0 + random.gauss(0, 0.02)

        # Utility fault
        if "utility_loss" in self._faults:
            ups.input_voltage_v = 0.0
            if self._gen_state == "TRANSFERRED":
                ups.mode = "BYPASS"
                ups.battery_soc = min(1.0, ups.battery_soc + 0.0005)
            else:
                ups.mode = "BATTERY"
                drain_rate = ups.output_load_w / (ups.rated_kw * 1000 * 3600 * 0.5)
                ups.battery_soc = max(0.0, ups.battery_soc - drain_rate)
        else:
            ups.input_voltage_v = 400.0 + random.gauss(0, 0.5)
            if ups.mode in ("BATTERY", "BYPASS"):
                ups.mode = "NORMAL"
            if ups.battery_soc < 1.0:
                ups.battery_soc = min(1.0, ups.battery_soc + 0.0005)

    def _tick_fire_safety(self) -> None:
        fs = self._state["fire_safety"]
        hall_zones = {"fz-hall-a": "data-hall-a", "fz-hall-b": "data-hall-b"}
        hall_heat: dict[str, float] = {}
        for pdu in self._state["pdus"]:
            hall_heat[pdu.location] = sum(r.inlet_temp_c for r in pdu.racks) / len(pdu.racks) if pdu.racks else 22.0

        for zone in fs.zones:
            hall_loc = hall_zones.get(zone.id)
            base_heat = hall_heat.get(hall_loc, 22.0) if hall_loc else zone.heat_c
            zone.heat_c += (base_heat - zone.heat_c) * 0.1
            zone.smoke_ppm = max(0.0, 5.0 + random.gauss(0, 0.3))

            if zone.status == "NORMAL" and zone.smoke_ppm > 50:
                zone.status = "ALARM"
                fs.last_alarm_zone = zone.id
            elif zone.status == "SUPPRESSING":
                zone.suppression_agent_pct = max(0.0, zone.suppression_agent_pct - 0.5)
                if zone.suppression_agent_pct <= 0:
                    zone.status = "NORMAL"

    def _tick_environment(self) -> None:
        env = self._state["environment"]
        hall_temps: dict[str, float] = {}
        for pdu in self._state["pdus"]:
            key = pdu.location
            hall_temps[key] = sum(r.inlet_temp_c for r in pdu.racks) / len(pdu.racks) if pdu.racks else 22.0

        zone_hall_map = {
            "env-hall-a": "data-hall-a",
            "env-hall-b": "data-hall-b",
        }
        for zone in env.zones:
            hall_key = zone_hall_map.get(zone.id)
            target_temp = hall_temps.get(hall_key, zone.temp_c) if hall_key else zone.temp_c
            zone.temp_c += (target_temp - zone.temp_c) * 0.15 + random.gauss(0, 0.05)
            zone.humidity_pct = max(20.0, min(80.0, zone.humidity_pct + random.gauss(0, 0.1)))
            zone.airflow_mps = max(0.1, zone.airflow_mps + random.gauss(0, 0.02))

            setpoint = self._crah_setpoint_c
            if zone.temp_c > setpoint + 8:
                zone.status = "CRITICAL"
            elif zone.temp_c > setpoint + 4:
                zone.status = "WARNING"
            else:
                zone.status = "NORMAL"

    def _tick_power_distribution(self) -> None:
        pd_state = self._state["power_distribution"]
        ups = self._state["ups"]
        pd_state.bus_voltage_v = ups.output_voltage_v + random.gauss(0, 0.2)
        pd_state.bus_frequency_hz = ups.frequency_hz + random.gauss(0, 0.01)

        hall_loads: dict[str, float] = {}
        for pdu in self._state["pdus"]:
            hall_loads[pdu.location] = pdu.it_load_w

        branch_hall_map = {
            "bc-hall-a-main": "data-hall-a",
            "bc-hall-b-main": "data-hall-b",
        }
        for bc in pd_state.branches:
            if not bc.breaker_on:
                bc.amps = 0.0
                continue
            hall_key = branch_hall_map.get(bc.id)
            if hall_key and hall_key in hall_loads:
                bc.amps = (hall_loads[hall_key] / (bc.volts * math.sqrt(3))) + random.gauss(0, 1.0)
            else:
                bc.amps = max(0.0, bc.amps + random.gauss(0, 0.5))
            bc.volts = pd_state.bus_voltage_v / math.sqrt(3) + random.gauss(0, 0.2)

    # ------------------------------------------------------------------
    # Control setters (called by API control endpoints)
    # ------------------------------------------------------------------

    def set_crah_setpoint(self, zone: str, setpoint_c: float) -> None:
        self._crah_setpoint_c = setpoint_c

    def set_ups_bypass(self, enabled: bool) -> None:
        self._state["ups_bypass_enabled"] = enabled
        if enabled:
            self._state["ups"].mode = "BYPASS"
        elif self._state["ups"].mode == "BYPASS":
            self._state["ups"].mode = "NORMAL"

    def set_gen_auto_start(self, enabled: bool) -> None:
        self._state["gen_auto_start"] = enabled

    def set_pdu_breaker(self, branch_id: str, on: bool) -> bool:
        for bc in self._state["power_distribution"].branches:
            if bc.id == branch_id:
                bc.breaker_on = on
                return True
        return False

    def reset_fire_zone(self, zone_id: str) -> bool:
        for zone in self._state["fire_safety"].zones:
            if zone.id == zone_id:
                if zone.status == "ALARM":
                    zone.status = "SUPPRESSING"
                elif zone.status == "SUPPRESSING":
                    zone.status = "NORMAL"
                    zone.smoke_ppm = 5.0
                    zone.suppression_agent_pct = 100.0
                return True
        return False

    def set_door_lock(self, door_id: str, locked: bool) -> bool:
        import datetime
        for door in self._state["access_control"].doors:
            if door.id == door_id:
                door.locked = locked
                door.last_event = datetime.datetime.now(datetime.timezone.utc).isoformat()
                return True
        return False

    def set_cooling_mode(self, mode: str) -> None:
        if mode == "ECONOMY":
            self._crah_setpoint_c = 26.0
        elif mode == "EMERGENCY":
            self._crah_setpoint_c = 18.0
        else:  # NORMAL
            self._crah_setpoint_c = 22.0

    def _build_snapshot(self) -> FacilitySnapshot:
        ups = self._state["ups"]
        cooling = self._state["cooling"]
        pdus = self._state["pdus"]

        return FacilitySnapshot(
            ups=ups,
            pdus=pdus,
            cooling=cooling,
            utility_online="utility_loss" not in self._faults,
            generator_state=self._gen_state,
            per_hall_cooling_kw=dict(self._hall_cooling),
            fire_safety=self._state["fire_safety"],
            access_control=self._state["access_control"],
            environment=self._state["environment"],
            power_distribution=self._state["power_distribution"],
            crah_setpoint_c=self._crah_setpoint_c,
            ups_bypass_enabled=self._state["ups_bypass_enabled"],
            gen_auto_start=self._state["gen_auto_start"],
        )
