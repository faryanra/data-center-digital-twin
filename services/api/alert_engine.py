"""Threshold policy kept separate from MQTT and persistence concerns."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AlertDecision:
    is_breach: bool
    severity: str | None = None
    message: str | None = None


def evaluate_threshold(device_type: str, value: float, threshold: float | None) -> AlertDecision:
    if threshold is None:
        return AlertDecision(False)

    is_low_limit = device_type.lower() in {"voltage", "volt"}
    breached = value <= threshold if is_low_limit else value >= threshold
    if not breached:
        return AlertDecision(False)

    difference = abs(value - threshold)
    relative_difference = difference / max(abs(threshold), 1.0)
    severity = "critical" if relative_difference >= 0.10 else "warning"
    direction = "below" if is_low_limit else "above"
    return AlertDecision(
        is_breach=True,
        severity=severity,
        message=f"{device_type} reading {value:g} is {direction} threshold {threshold:g}",
    )
