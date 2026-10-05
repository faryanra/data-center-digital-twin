import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from services.api.alarms import AlarmManager, Severity, AlarmState


def test_raise_and_list():
    mgr = AlarmManager()
    mgr.raise_alarm(Severity.CRITICAL, "ups-01", "UPS on battery")
    assert mgr.active_count == 1
    assert mgr.critical_count == 1


def test_deduplication():
    mgr = AlarmManager()
    a1 = mgr.raise_alarm(Severity.CRITICAL, "ups-01", "UPS on battery")
    a2 = mgr.raise_alarm(Severity.CRITICAL, "ups-01", "UPS on battery")
    assert a1 is not None
    assert a2 is None
    assert mgr.active_count == 1


def test_auto_clear_removes_active():
    mgr = AlarmManager()
    mgr.raise_alarm(Severity.WARNING, "rack-a01", "Rack inlet elevated")
    mgr.auto_clear("rack-a01", "Rack inlet elevated")
    assert mgr.active_count == 0


def test_auto_clear_keeps_acked():
    mgr = AlarmManager()
    alarm = mgr.raise_alarm(Severity.WARNING, "rack-a01", "Rack inlet elevated")
    assert alarm is not None
    mgr.acknowledge(alarm.id, "operator@datacenter.local")
    mgr.auto_clear("rack-a01", "Rack inlet elevated")
    assert len(mgr.list_all()) == 1
    assert mgr.list_all()[0].state == AlarmState.ACKNOWLEDGED


def test_acknowledge_sets_state():
    mgr = AlarmManager()
    alarm = mgr.raise_alarm(Severity.CRITICAL, "ups-01", "UPS on battery")
    assert alarm is not None
    mgr.acknowledge(alarm.id, "operator@datacenter.local")
    assert mgr.active_count == 0
    acked = mgr.list_all()[0]
    assert acked.state == AlarmState.ACKNOWLEDGED
    assert acked.acked_by == "operator@datacenter.local"


def test_clear_removes_alarm():
    mgr = AlarmManager()
    alarm = mgr.raise_alarm(Severity.CRITICAL, "ups-01", "UPS on battery")
    assert alarm is not None
    mgr.acknowledge(alarm.id, "operator@datacenter.local")
    assert mgr.clear(alarm.id)
    assert len(mgr.list_all()) == 0


def test_evaluator_on_utility_loss():
    from simulation.electrical.facility_sim import FacilitySimulator
    from services.api.alarm_evaluator import evaluate
    sim = FacilitySimulator()
    sim.tick()
    sim.inject_fault("utility_loss")
    snap = sim.tick()
    mgr = AlarmManager()
    evaluate(snap, mgr)
    assert mgr.critical_count >= 1
