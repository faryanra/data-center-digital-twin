import pytest
from simulation.electrical.facility_sim import FacilitySimulator


def test_initial_state():
    sim = FacilitySimulator()
    assert sim._gen_state == "STANDBY"


def test_utility_loss_starts_generator():
    sim = FacilitySimulator()
    sim.inject_fault("utility_loss")
    sim.tick()
    assert sim._gen_state == "STARTING"


def test_transfers_after_5s():
    sim = FacilitySimulator()
    sim.inject_fault("utility_loss")
    sim.tick()
    sim._gen_state_entered_at -= 6.0   # fast-forward time
    sim.tick()
    assert sim._gen_state == "TRANSFERRED"


def test_recovery_when_utility_restored():
    sim = FacilitySimulator()
    sim.inject_fault("utility_loss")
    sim.tick()
    sim._gen_state_entered_at -= 6.0
    sim.tick()
    sim.clear_fault("utility_loss")
    sim.tick()
    assert sim._gen_state == "RECOVERY"


def test_full_cycle():
    sim = FacilitySimulator()
    sim.inject_fault("utility_loss"); sim.tick()
    sim._gen_state_entered_at -= 6.0;  sim.tick()
    sim.clear_fault("utility_loss");   sim.tick()
    sim._gen_state_entered_at -= 4.0;  sim.tick()
    assert sim._gen_state == "STANDBY"


def test_generator_fail_blocks_transfer():
    sim = FacilitySimulator()
    sim.inject_fault("utility_loss")
    sim.inject_fault("generator_fail")
    sim.tick()
    assert sim._gen_state == "STANDBY"


def test_crah_a_trip_isolates_hall_a():
    sim = FacilitySimulator()
    before = sim.get_snapshot().per_hall_cooling_kw.copy()
    sim.inject_fault("crah_a_trip")
    sim.tick()
    after = sim.get_snapshot().per_hall_cooling_kw
    assert after["data_hall_a"] < before["data_hall_a"] * 0.5
    assert after["data_hall_b"] == before["data_hall_b"]
