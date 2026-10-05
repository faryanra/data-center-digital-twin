"""Unit tests for the physics-based electrical model."""

from __future__ import annotations

import math
import os
import sys

import pytest

# Ensure project root is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from simulation.electrical.models import (
    ThreePhaseReading,
    RackState,
    PDUState,
    UPSState,
    CoolingLoad,
    FacilitySnapshot,
)
from simulation.electrical.facility_sim import FacilitySimulator


# ---------------------------------------------------------------------------
# 1. ThreePhaseReading: S² = P² + Q²
# ---------------------------------------------------------------------------

def test_three_phase_power_identity():
    reading = ThreePhaseReading(
        voltage_l1=230.0, voltage_l2=230.0, voltage_l3=230.0,
        current_l1=10.0, current_l2=10.0, current_l3=10.0,
        frequency=50.0, power_factor=0.9,
    )
    P = reading.active_power
    Q = reading.reactive_power
    S = reading.apparent_power
    assert math.isclose(S**2, P**2 + Q**2, rel_tol=1e-9)


# ---------------------------------------------------------------------------
# 2. RackState: heat_output_w == active_power_w (energy conservation)
# ---------------------------------------------------------------------------

def test_rack_energy_conservation():
    rack = RackState(
        id="rack-t01", location="data-hall-a",
        rated_power_w=10_000, load_factor=0.65,
        inlet_temp_c=22.0, outlet_temp_c=32.0,
    )
    assert math.isclose(rack.heat_output_w, rack.active_power_w)


# ---------------------------------------------------------------------------
# 3. PDU input_power_w accounts for efficiency loss
# ---------------------------------------------------------------------------

def test_pdu_power_flow():
    racks = [
        RackState(id=f"r{i}", location="hall-a",
                  rated_power_w=10_000, load_factor=0.7,
                  inlet_temp_c=22.0, outlet_temp_c=32.0)
        for i in range(5)
    ]
    pdu = PDUState(id="pdu-t01", location="hall-a",
                   rated_power_w=60_000, racks=racks, efficiency=0.98)
    expected_it = sum(r.active_power_w for r in racks)
    assert math.isclose(pdu.it_load_w, expected_it)
    assert math.isclose(pdu.input_power_w, expected_it / 0.98)
    assert pdu.input_power_w > pdu.it_load_w


# ---------------------------------------------------------------------------
# 4. UPS: on battery → input_power_w == 0
# ---------------------------------------------------------------------------

def test_ups_battery_mode():
    ups = UPSState(id="ups-t01", rated_kva=800, rated_kw=720,
                   mode="BATTERY", output_load_w=200_000)
    assert ups.input_power_w == 0.0


# ---------------------------------------------------------------------------
# 5. FacilitySnapshot: PUE > 1.0 under normal load
# ---------------------------------------------------------------------------

def test_facility_snapshot_pue():
    sim = FacilitySimulator()
    snap = sim.tick()
    assert snap.it_load_w > 0
    assert snap.pue > 1.0, f"PUE should be > 1.0, got {snap.pue}"


# ---------------------------------------------------------------------------
# 6. Fault injection: utility_loss switches UPS to BATTERY
# ---------------------------------------------------------------------------

def test_utility_loss_fault():
    sim = FacilitySimulator()
    sim.inject_fault("utility_loss")
    for _ in range(3):
        snap = sim.tick()
    assert snap.ups.mode == "BATTERY"
    assert snap.ups.input_power_w == 0.0
    assert not snap.utility_online


# ---------------------------------------------------------------------------
# 7. Clearing a fault restores normal operation
# ---------------------------------------------------------------------------

def test_clear_fault_restores_normal():
    sim = FacilitySimulator()
    sim.inject_fault("utility_loss")
    for _ in range(3):
        sim.tick()
    sim.clear_fault("utility_loss")
    snap = sim.tick()
    assert snap.ups.mode == "NORMAL"
    assert snap.utility_online
