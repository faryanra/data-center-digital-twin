"""MQTT worker that persists compatible telemetry and emits deduplicated alerts."""

from __future__ import annotations

import json
import logging
import os
import sys
from typing import Any

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)

import paho.mqtt.client as mqtt
from common.database import Database
from common.metrics import (
    alerts_fired_total,
    energy_kwh_total,
    frequency_hz,
    mqtt_message_errors_total,
    mqtt_messages_total,
    power_consumption_watts,
    power_factor,
    telemetry_readings_total,
    temperature_celsius,
    voltage_volts,
)
from common.settings import Settings, get_settings
from common.telemetry import PayloadError, parse_telemetry

from alert_engine import evaluate_threshold
from offline_detector import OfflineDetector

LOG = logging.getLogger(__name__)


def infer_device_type(device_id: str, topic: str, metric_type: str = "unknown") -> str:
    if metric_type not in {"unknown", ""}:
        return metric_type
    value = f"{device_id} {topic}".lower()
    if "temp" in value or "temperature" in value:
        return "temperature"
    if "volt" in value or "voltage" in value:
        return "voltage"
    if "current" in value:
        return "current"
    if "power" in value:
        return "power"
    if "energy" in value:
        return "energy"
    return "unknown"


class TelemetryProcessor:
    def __init__(self, database: Database, settings: Settings):
        self.database = database
        self.settings = settings

    def process(self, payload: bytes | str | dict[str, Any], topic: str = "") -> dict[str, Any]:
        reading = parse_telemetry(payload)
        device = self.database.ensure_device(reading.device_id, topic, infer_device_type(reading.device_id, topic, reading.metric_type))
        self.database.insert_telemetry(device["id"], reading.value, reading.timestamp)

        topic_prefix = topic.split("/")[0] if "/" in topic else topic
        mqtt_messages_total.labels(topic_prefix=topic_prefix, device_id=reading.device_id).inc()
        telemetry_readings_total.labels(metric_type=reading.metric_type, device_id=reading.device_id).inc()
        mtype = reading.metric_type
        if mtype == "power":
            power_consumption_watts.labels(device_id=reading.device_id).set(reading.value * 1000)
        elif mtype == "energy":
            energy_kwh_total.labels(device_id=reading.device_id).set(reading.value)
        elif mtype == "temperature":
            temperature_celsius.labels(device_id=reading.device_id).set(reading.value)
        elif mtype == "voltage":
            voltage_volts.labels(device_id=reading.device_id).set(reading.value)
        elif mtype == "power_factor":
            power_factor.labels(device_id=reading.device_id).set(reading.value)
        elif mtype == "frequency":
            frequency_hz.labels(device_id=reading.device_id).set(reading.value)

        decision = evaluate_threshold(device["type"], reading.value, device["threshold"])

        alert_payload = None
        if decision.is_breach:
            active = self.database.active_alert(device["id"])
            if active is None:
                alert = self.database.create_alert(
                    device["id"], reading.value, float(device["threshold"]), decision.severity or "warning",
                    decision.message or "Threshold breached", reading.timestamp,
                )
                alerts_fired_total.labels(severity=alert["severity"], device_id=reading.device_id).inc()
                alert_payload = {
                    "sensorId": reading.device_id,
                    "value": reading.value,
                    "ts": int(reading.timestamp.timestamp()),
                    "severity": alert["severity"],
                    "message": alert["message"],
                }
        else:
            self.database.resolve_alerts(device["id"])

        return {"device": device, "reading": reading, "alert": alert_payload}


class TelemetryWorker:
    def __init__(self, processor: TelemetryProcessor):
        self.processor = processor
        self.client = mqtt.Client(client_id="telemetry-service", protocol=mqtt.MQTTv311)
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message

    def on_connect(self, client: mqtt.Client, _userdata: Any, _flags: Any, rc: int) -> None:
        if rc != 0:
            LOG.error("MQTT connection failed: %s", rc)
            return
        client.subscribe(self.processor.settings.mqtt_telemetry_topic, qos=1)
        LOG.info("Subscribed to %s", self.processor.settings.mqtt_telemetry_topic)

    def on_message(self, client: mqtt.Client, _userdata: Any, message: mqtt.MQTTMessage) -> None:
        if message.topic == self.processor.settings.mqtt_alert_topic:
            return
        try:
            result = self.processor.process(message.payload, message.topic)
        except PayloadError as exc:
            LOG.warning("Ignored invalid telemetry on %s: %s", message.topic, exc)
            return
        except Exception:
            LOG.exception("Telemetry processing failed for %s", message.topic)
            mqtt_message_errors_total.inc()
            return
        LOG.debug("Processed %s: device=%s value=%s", message.topic, result["device"].get("device_id"), result["reading"].value)
        if result["alert"]:
            alert = result["alert"]
            LOG.info("Alert fired: sensor=%s value=%s severity=%s — publishing to %s", alert.get("sensorId"), alert.get("value"), alert.get("severity"), self.processor.settings.mqtt_alert_topic)
            client.publish(self.processor.settings.mqtt_alert_topic, json.dumps(alert), qos=1)

    def run(self) -> None:
        OfflineDetector(self.processor.database).start()
        settings = self.processor.settings
        self.client.connect(settings.mqtt_host, settings.mqtt_port, keepalive=60)
        self.client.loop_forever()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    settings = get_settings()
    database = Database.from_settings(settings)
    database.initialize()
    TelemetryWorker(TelemetryProcessor(database, settings)).run()


if __name__ == "__main__":
    main()
