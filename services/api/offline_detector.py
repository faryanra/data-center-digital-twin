"""Background thread that fires critical alerts when a device stops sending telemetry."""

from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timezone

from common.database import Database

LOG = logging.getLogger(__name__)
OFFLINE_THRESHOLD_SECONDS = 60


class OfflineDetector:
    def __init__(self, database: Database):
        self.database = database
        self._thread = threading.Thread(target=self._run, daemon=True)

    def start(self) -> None:
        self._thread.start()
        LOG.info("OfflineDetector started (threshold=%ds)", OFFLINE_THRESHOLD_SECONDS)

    def _run(self) -> None:
        while True:
            time.sleep(30)
            try:
                self._check()
            except Exception:
                LOG.exception("OfflineDetector check failed")

    def _check(self) -> None:
        now = datetime.now(timezone.utc)
        for d in self.database.list_devices_last_seen():
            last_seen = d["last_seen"]
            if last_seen is None:
                continue
            if isinstance(last_seen, str):
                last_seen = datetime.fromisoformat(last_seen)
            if last_seen.tzinfo is None:
                last_seen = last_seen.replace(tzinfo=timezone.utc)
            age = (now - last_seen).total_seconds()
            if age <= OFFLINE_THRESHOLD_SECONDS:
                continue
            LOG.warning("Device offline: %s (last seen %.0fs ago)", d["device_id"], age)
            if self.database.active_alert(d["id"]) is None:
                self.database.create_alert(
                    d["id"],
                    round(age, 1),
                    float(OFFLINE_THRESHOLD_SECONDS),
                    "critical",
                    f"Device offline: no telemetry for {age:.0f}s (threshold {OFFLINE_THRESHOLD_SECONDS}s)",
                    now,
                )
                LOG.info("Offline alert created for device %s", d["device_id"])
