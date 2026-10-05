"""In-memory facility-level time-series history.

The broadcast loop records one downsampled point every few seconds so the
dashboard can show real history (up to 7 days) without a dedicated time-series
database. Reads are downsampled to keep charts light. Thread-safe.
"""
from __future__ import annotations

import threading
import time
from collections import deque

# Record at most one point per this many seconds.
_MIN_INTERVAL_S = 15
# Ring capacity ≈ 7 days at the record interval, plus headroom.
_MAX_POINTS = 7 * 24 * 60 * 60 // _MIN_INTERVAL_S + 200
# Cap points returned per request so charts stay smooth.
_READ_TARGET = 240

_lock = threading.Lock()
_points: deque[dict] = deque(maxlen=_MAX_POINTS)
_last_ts = 0.0


def record(snapshot: dict) -> None:
    """Append a facility point from a broadcast snapshot (rate-limited)."""
    global _last_ts
    ts = float(snapshot.get("ts", time.time()))
    cooling = snapshot.get("cooling") or {}
    with _lock:
        if ts - _last_ts < _MIN_INTERVAL_S:
            return
        _last_ts = ts
        _points.append({
            "ts": round(ts, 1),
            "it_load_kw": snapshot.get("it_load_kw", 0),
            "total_power_kw": snapshot.get("total_power_kw", 0),
            "cooling_power_kw": cooling.get("cooling_power_kw", 0),
            "pue": snapshot.get("pue", 0),
        })


def history(hours: int) -> list[dict]:
    """Return downsampled points from the last `hours`."""
    cutoff = time.time() - hours * 3600
    with _lock:
        window = [p for p in _points if p["ts"] >= cutoff]
    return _downsample(window, _READ_TARGET)


def _downsample(points: list[dict], target: int) -> list[dict]:
    n = len(points)
    if n <= target:
        return points
    step = n / target
    sampled = [points[int(i * step)] for i in range(target)]
    # Always include the most recent point.
    if sampled[-1] is not points[-1]:
        sampled.append(points[-1])
    return sampled
