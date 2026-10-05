"""
Electrical model — power flow from utility through UPS, PDU, to racks.
All values in SI units: W, V, A, Hz, power factor (dimensionless).
"""

from __future__ import annotations
import math
import random
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ThreePhaseReading:
    """Balanced 3-phase measurement at a point in the network."""
    voltage_l1: float   # V RMS line-to-neutral
    voltage_l2: float
    voltage_l3: float
    current_l1: float   # A RMS
    current_l2: float
    current_l3: float
    frequency: float    # Hz
    power_factor: float # 0.0 – 1.0

    @property
    def active_power(self) -> float:
        """Total 3-phase active power (W)."""
        v_avg = (self.voltage_l1 + self.voltage_l2 + self.voltage_l3) / 3
        i_avg = (self.current_l1 + self.current_l2 + self.current_l3) / 3
        return 3 * v_avg * i_avg * self.power_factor

    @property
    def apparent_power(self) -> float:
        """Total 3-phase apparent power (VA)."""
        v_avg = (self.voltage_l1 + self.voltage_l2 + self.voltage_l3) / 3
        i_avg = (self.current_l1 + self.current_l2 + self.current_l3) / 3
        return 3 * v_avg * i_avg

    @property
    def reactive_power(self) -> float:
        """Total 3-phase reactive power (VAR)."""
        return math.sqrt(max(0, self.apparent_power**2 - self.active_power**2))


@dataclass
class RackState:
    id: str
    location: str          # e.g. "data-hall-a"
    rated_power_w: float   # nameplate max
    load_factor: float     # 0.0 – 1.0, varies over time
    inlet_temp_c: float    # °C
    outlet_temp_c: float   # °C
    status: str = "ONLINE" # ONLINE | WARNING | OFFLINE

    @property
    def active_power_w(self) -> float:
        return self.rated_power_w * self.load_factor

    @property
    def heat_output_w(self) -> float:
        """Electrical power becomes heat (conservation of energy)."""
        return self.active_power_w


@dataclass
class PDUState:
    id: str
    location: str
    rated_power_w: float
    racks: list[RackState] = field(default_factory=list)
    efficiency: float = 0.98   # PDU losses

    @property
    def it_load_w(self) -> float:
        return sum(r.active_power_w for r in self.racks if r.status != "OFFLINE")

    @property
    def input_power_w(self) -> float:
        return self.it_load_w / self.efficiency

    @property
    def load_factor(self) -> float:
        return self.input_power_w / self.rated_power_w if self.rated_power_w else 0


@dataclass
class UPSState:
    id: str
    rated_kva: float
    rated_kw: float
    efficiency: float = 0.96
    battery_soc: float = 0.94   # 0.0 – 1.0
    battery_temp_c: float = 23.0
    mode: str = "NORMAL"        # NORMAL | BATTERY | BYPASS | FAULT
    status: str = "ONLINE"

    input_voltage_v: float = 400.0
    output_voltage_v: float = 400.0
    frequency_hz: float = 50.0

    output_load_w: float = 0.0  # set by facility model each tick

    @property
    def load_percent(self) -> float:
        return (self.output_load_w / (self.rated_kw * 1000)) * 100

    @property
    def input_ok(self) -> bool:
        return self.mode not in ("BATTERY", "FAULT")

    @property
    def input_power_w(self) -> float:
        if self.mode == "BATTERY":
            return 0.0
        return self.output_load_w / self.efficiency


@dataclass
class CoolingLoad:
    """Simplified cooling model — tracks heat and CRAH state."""
    total_it_heat_w: float = 0.0
    crah_online_count: int = 2
    crah_total_count: int = 2
    supply_temp_c: float = 18.0
    return_temp_c: float = 28.0
    cooling_power_w: float = 0.0    # power consumed by cooling equipment

    @property
    def cop(self) -> float:
        """Coefficient of performance (heat removed / electrical input)."""
        return self.total_it_heat_w / self.cooling_power_w if self.cooling_power_w else 0


@dataclass
class FireZone:
    id: str
    name: str
    status: str = "NORMAL"              # NORMAL | ALARM | SUPPRESSING
    smoke_ppm: float = 5.0
    heat_c: float = 22.0
    suppression_agent_pct: float = 100.0


@dataclass
class FireSafetyState:
    zones: list[FireZone] = field(default_factory=list)
    system_armed: bool = True
    last_alarm_zone: Optional[str] = None


@dataclass
class Door:
    id: str
    location: str
    locked: bool = True
    badge_required: bool = True
    last_event: Optional[str] = None


@dataclass
class AccessControlState:
    doors: list[Door] = field(default_factory=list)
    intrusion_detected: bool = False


@dataclass
class EnvZone:
    id: str
    location: str
    temp_c: float = 22.0
    humidity_pct: float = 45.0
    airflow_mps: float = 1.5
    status: str = "NORMAL"              # NORMAL | WARNING | CRITICAL


@dataclass
class EnvironmentState:
    zones: list[EnvZone] = field(default_factory=list)


@dataclass
class BranchCircuit:
    id: str
    label: str
    phase: str                          # A | B | C
    amps: float = 0.0
    volts: float = 230.0
    breaker_on: bool = True


@dataclass
class PowerDistributionState:
    bus_voltage_v: float = 400.0
    bus_frequency_hz: float = 50.0
    branches: list[BranchCircuit] = field(default_factory=list)


@dataclass
class FacilitySnapshot:
    """Single point-in-time state of the whole facility."""
    ups: UPSState
    pdus: list[PDUState]
    cooling: CoolingLoad
    utility_online: bool = True
    generator_state: str = "STANDBY"   # STANDBY | STARTING | TRANSFERRED | RECOVERY
    generator_fuel_pct: float = 87.0
    per_hall_cooling_kw: dict[str, float] = field(
        default_factory=lambda: {"data_hall_a": 500.0, "data_hall_b": 500.0}
    )
    fire_safety: FireSafetyState = field(default_factory=FireSafetyState)
    access_control: AccessControlState = field(default_factory=AccessControlState)
    environment: EnvironmentState = field(default_factory=EnvironmentState)
    power_distribution: PowerDistributionState = field(default_factory=PowerDistributionState)
    crah_setpoint_c: float = 22.0
    ups_bypass_enabled: bool = False
    gen_auto_start: bool = True

    @property
    def it_load_w(self) -> float:
        return sum(p.it_load_w for p in self.pdus)

    @property
    def total_facility_power_w(self) -> float:
        return self.ups.input_power_w + self.cooling.cooling_power_w

    @property
    def pue(self) -> float:
        if self.it_load_w == 0:
            return 0.0
        return self.total_facility_power_w / self.it_load_w
