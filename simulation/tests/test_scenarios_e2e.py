"""E2E scenario tests — full chain: simulator tick → alarm evaluator → snapshot schema."""
import sys
import os
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'services', 'api'))

from simulation.electrical.facility_sim import FacilitySimulator
from simulation.electrical.models import FacilitySnapshot
from alarm_evaluator import evaluate as evaluate_alarms
from alarms import AlarmManager


# ── helper ───────────────────────────────────────────────────────────────────

def _tick_n(sim: FacilitySimulator, n: int) -> FacilitySnapshot:
    snap = None
    for _ in range(n):
        snap = sim.tick()
    assert snap is not None
    return snap


# ── TestUtilityLossFullChain ─────────────────────────────────────────────────

class TestUtilityLossFullChain:
    def test_normal_boot_no_alarms(self):
        sim = FacilitySimulator()
        mgr = AlarmManager()
        snap = sim.tick()
        evaluate_alarms(snap, mgr)
        critical = [a for a in mgr.list_all() if a.severity.value == "CRITICAL"]
        assert len(critical) == 0

    def test_utility_loss_raises_critical_alarm(self):
        sim = FacilitySimulator()
        mgr = AlarmManager()
        sim.inject_fault("utility_loss")
        snap = sim.tick()
        evaluate_alarms(snap, mgr)
        assert not snap.utility_online
        sources = [a.source for a in mgr.list_all()]
        assert any("utility" in s or "ups" in s.lower() for s in sources)

    def test_generator_transfers_after_5s(self):
        sim = FacilitySimulator()
        mgr = AlarmManager()
        sim.inject_fault("utility_loss")
        sim.tick()  # enter STARTING
        sim._gen_state_entered_at -= 6.0
        snap = sim.tick()  # should transfer
        evaluate_alarms(snap, mgr)
        assert snap.generator_state == "TRANSFERRED"

    def test_snapshot_has_required_fields(self):
        sim = FacilitySimulator()
        snap = sim.tick()
        assert hasattr(snap, "pue")
        assert hasattr(snap, "utility_online")
        assert hasattr(snap, "generator_state")
        assert hasattr(snap, "per_hall_cooling_kw")
        assert hasattr(snap, "ups")
        assert hasattr(snap, "pdus")
        assert hasattr(snap, "cooling")

    def test_utility_restored_clears_generator(self):
        sim = FacilitySimulator()
        sim.inject_fault("utility_loss")
        sim.tick()  # enter STARTING
        sim._gen_state_entered_at -= 6.0
        sim.tick()  # enter TRANSFERRED
        assert sim._gen_state == "TRANSFERRED"
        sim.clear_fault("utility_loss")
        sim.tick()
        assert sim._gen_state in ("RECOVERY", "STANDBY")


# ── TestThermalIsolation ─────────────────────────────────────────────────────

class TestThermalIsolation:
    def test_crah_a_trip_reduces_hall_a_cooling(self):
        sim = FacilitySimulator()
        snap_before = sim.tick()
        hall_a_before = snap_before.per_hall_cooling_kw.get("data_hall_a", 0.0)

        sim.inject_fault("crah_a_trip")
        snap_after = sim.tick()
        hall_a_after = snap_after.per_hall_cooling_kw.get("data_hall_a", 0.0)

        assert hall_a_after < hall_a_before

    def test_crah_a_trip_does_not_affect_hall_b(self):
        sim = FacilitySimulator()
        snap_before = sim.tick()
        hall_b_before = snap_before.per_hall_cooling_kw.get("data_hall_b", 0.0)

        sim.inject_fault("crah_a_trip")
        snap_after = sim.tick()
        hall_b_after = snap_after.per_hall_cooling_kw.get("data_hall_b", 0.0)

        assert abs(hall_b_after - hall_b_before) < 50.0

    def test_cooling_keys_present(self):
        sim = FacilitySimulator()
        snap = sim.tick()
        assert "data_hall_a" in snap.per_hall_cooling_kw
        assert "data_hall_b" in snap.per_hall_cooling_kw


# ── TestSnapshotSchema ────────────────────────────────────────────────────────

class TestSnapshotSchema:
    def test_generator_state_valid_enum(self):
        sim = FacilitySimulator()
        valid = {"STANDBY", "STARTING", "TRANSFERRED", "RECOVERY"}
        for _ in range(3):
            snap = sim.tick()
            assert snap.generator_state in valid

    def test_pue_reasonable_range(self):
        sim = FacilitySimulator()
        snap = sim.tick()
        assert 1.0 <= snap.pue <= 3.0

    def test_pdus_not_empty(self):
        sim = FacilitySimulator()
        snap = sim.tick()
        assert len(snap.pdus) > 0

    def test_racks_have_required_attrs(self):
        sim = FacilitySimulator()
        snap = sim.tick()
        for pdu in snap.pdus:
            for rack in pdu.racks:
                assert hasattr(rack, "id")
                assert hasattr(rack, "inlet_temp_c")
                assert hasattr(rack, "outlet_temp_c")
                assert hasattr(rack, "status")
