"""
Alarm lifecycle management.

Lifecycle: ACTIVE → ACKNOWLEDGED → (cleared by admin)
Auto-clear only removes ACTIVE alarms — never ACKNOWLEDGED ones.
Deduplication: one active/acked alarm per (source, message) pair.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from enum import Enum
from threading import Lock


class Severity(str, Enum):
    CRITICAL = "CRITICAL"
    WARNING  = "WARNING"
    INFO     = "INFO"


class AlarmState(str, Enum):
    ACTIVE       = "ACTIVE"
    ACKNOWLEDGED = "ACKNOWLEDGED"


@dataclass
class Alarm:
    id: str
    severity: Severity
    source: str
    message: str
    raised_at: float
    state: AlarmState = AlarmState.ACTIVE
    acked_by: str | None = None
    acked_at: float | None = None


class AlarmManager:
    def __init__(self) -> None:
        self._lock = Lock()
        self._alarms: dict[str, Alarm] = {}
        self._active_keys: dict[tuple[str, str], str] = {}

    def raise_alarm(self, severity: Severity, source: str, message: str) -> Alarm | None:
        key = (source, message)
        with self._lock:
            if key in self._active_keys:
                return None
            alarm = Alarm(
                id=str(uuid.uuid4())[:8],
                severity=severity,
                source=source,
                message=message,
                raised_at=time.time(),
            )
            self._alarms[alarm.id] = alarm
            self._active_keys[key] = alarm.id
            return alarm

    def auto_clear(self, source: str, message: str) -> None:
        key = (source, message)
        with self._lock:
            alarm_id = self._active_keys.get(key)
            if not alarm_id:
                return
            alarm = self._alarms.get(alarm_id)
            if alarm and alarm.state == AlarmState.ACTIVE:
                del self._alarms[alarm_id]
                del self._active_keys[key]

    def acknowledge(self, alarm_id: str, user: str) -> Alarm | None:
        with self._lock:
            alarm = self._alarms.get(alarm_id)
            if not alarm or alarm.state != AlarmState.ACTIVE:
                return None
            alarm.state = AlarmState.ACKNOWLEDGED
            alarm.acked_by = user
            alarm.acked_at = time.time()
            return alarm

    def clear(self, alarm_id: str) -> bool:
        with self._lock:
            alarm = self._alarms.pop(alarm_id, None)
            if not alarm:
                return False
            self._active_keys.pop((alarm.source, alarm.message), None)
            return True

    def list_active(self) -> list[Alarm]:
        with self._lock:
            return sorted(
                [a for a in self._alarms.values() if a.state == AlarmState.ACTIVE],
                key=lambda a: a.raised_at, reverse=True,
            )

    def list_all(self) -> list[Alarm]:
        with self._lock:
            return sorted(self._alarms.values(), key=lambda a: a.raised_at, reverse=True)

    @property
    def active_count(self) -> int:
        with self._lock:
            return sum(1 for a in self._alarms.values() if a.state == AlarmState.ACTIVE)

    @property
    def critical_count(self) -> int:
        with self._lock:
            return sum(
                1 for a in self._alarms.values()
                if a.severity == Severity.CRITICAL and a.state == AlarmState.ACTIVE
            )
