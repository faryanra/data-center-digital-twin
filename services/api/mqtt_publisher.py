"""
MQTT publisher — broadcasts FacilitySnapshot to broker every simulation tick.

Topics (QoS 0, retained):
  dc/facility/snapshot   — full JSON snapshot
  dc/power/summary       — {total_it_kw, pue, generator_state, ts}
  dc/thermal/summary     — {supply_temp_c, return_temp_c, total_cooling_kw, per_hall, ts}
"""
from __future__ import annotations

import json
import logging
import time

import paho.mqtt.client as mqtt

logger = logging.getLogger(__name__)

_client: mqtt.Client | None = None
_connected = False


def _on_connect(client, userdata, flags, rc, properties=None):
    global _connected
    _connected = rc == 0
    if _connected:
        logger.info("MQTT connected")
    else:
        logger.warning("MQTT connect failed rc=%d", rc)


def _on_disconnect(client, userdata, flags, rc, properties=None):
    global _connected
    _connected = False


def init_mqtt(host: str = "localhost", port: int = 1883) -> None:
    global _client
    _client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="dc-digital-twin")
    _client.on_connect = _on_connect
    _client.on_disconnect = _on_disconnect
    try:
        _client.connect_async(host, port)
        _client.loop_start()
        logger.info("MQTT connecting to %s:%d", host, port)
    except Exception as exc:
        logger.warning("MQTT unavailable (running without broker): %s", exc)


def publish_snapshot(snapshot) -> None:
    if not (_client and _connected):
        return
    try:
        full = {
            "ts": time.time(),
            "utility_online": snapshot.utility_online,
            "generator_state": snapshot.generator_state,
            "generator_fuel_pct": snapshot.generator_fuel_pct,
            "per_hall_cooling_kw": snapshot.per_hall_cooling_kw,
            "ups": {
                "id": snapshot.ups.id,
                "mode": snapshot.ups.mode,
                "input_voltage_v": snapshot.ups.input_voltage_v,
                "output_voltage_v": snapshot.ups.output_voltage_v,
                "load_percent": round(snapshot.ups.load_percent, 1),
                "battery_soc": round(snapshot.ups.battery_soc, 3),
            },
            "cooling": {
                "supply_temp_c": round(snapshot.cooling.supply_temp_c, 1),
                "return_temp_c": round(snapshot.cooling.return_temp_c, 1),
                "cooling_power_w": round(snapshot.cooling.cooling_power_w, 0),
                "crah_online": snapshot.cooling.crah_online_count,
                "crah_total": snapshot.cooling.crah_total_count,
                "cop": round(snapshot.cooling.cop, 2),
            },
        }
        _client.publish("dc/facility/snapshot", json.dumps(full, default=str), qos=0, retain=True)
        _client.publish("dc/power/summary", json.dumps({
            "total_it_kw":     round(snapshot.it_load_w / 1000, 1),
            "pue":             round(snapshot.pue, 3),
            "generator_state": snapshot.generator_state,
            "ts":              time.time(),
        }), qos=0)
        _client.publish("dc/thermal/summary", json.dumps({
            "supply_temp_c":       round(snapshot.cooling.supply_temp_c, 1),
            "return_temp_c":       round(snapshot.cooling.return_temp_c, 1),
            "total_cooling_kw":    round(snapshot.cooling.cooling_power_w / 1000, 1),
            "per_hall_cooling_kw": snapshot.per_hall_cooling_kw,
            "ts":                  time.time(),
        }), qos=0)
    except Exception as exc:
        logger.debug("MQTT publish error: %s", exc)


def shutdown_mqtt() -> None:
    global _client
    if _client:
        _client.loop_stop()
        _client.disconnect()
        _client = None
