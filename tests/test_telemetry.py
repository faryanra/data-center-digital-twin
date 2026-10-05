from datetime import timezone

import pytest

from common.telemetry import PayloadError, parse_telemetry


def test_parses_existing_senml_payload():
    reading = parse_telemetry({"bn": "sensor/temp_01", "e": [{"v": 25.4, "t": 1720000000}]})

    assert reading.device_id == "temp_01"
    assert reading.value == 25.4
    assert reading.timestamp.tzinfo == timezone.utc


def test_parses_legacy_alert_payload():
    reading = parse_telemetry({"sensorId": "volt_01", "value": 219, "ts": 1720000000})

    assert reading.device_id == "volt_01"
    assert reading.value == 219.0


def test_rejects_invalid_payload():
    with pytest.raises(PayloadError):
        parse_telemetry({"unexpected": True})


def test_rejects_nan_value():
    with pytest.raises(PayloadError, match="finite"):
        parse_telemetry({"bn": "sensor/temp_01", "e": [{"v": float("nan"), "t": 1720000000}]})


def test_rejects_inf_value():
    with pytest.raises(PayloadError, match="finite"):
        parse_telemetry({"bn": "sensor/temp_01", "e": [{"v": float("inf"), "t": 1720000000}]})


def test_rejects_string_nan_value():
    with pytest.raises(PayloadError, match="finite"):
        parse_telemetry({"sensorId": "volt_01", "value": "nan", "ts": 1720000000})
