"""Prometheus custom metrics for IoT platform observability."""

from prometheus_client import Counter, Gauge, Histogram  # noqa: F401 (Histogram exported for future use)

mqtt_messages_total = Counter(
    "iot_mqtt_messages_total",
    "Total MQTT messages received",
    ["topic_prefix", "device_id"],
)

mqtt_message_errors_total = Counter(
    "iot_mqtt_message_errors_total",
    "Total MQTT message processing errors",
)

devices_online = Gauge(
    "iot_devices_online_total",
    "Number of devices seen in last 60 seconds",
)

devices_offline = Gauge(
    "iot_devices_offline_total",
    "Number of devices offline (last seen > 60s)",
)

telemetry_readings_total = Counter(
    "iot_telemetry_readings_total",
    "Total telemetry readings stored",
    ["metric_type", "device_id"],
)

power_consumption_watts = Gauge(
    "iot_power_consumption_watts",
    "Current power consumption in watts",
    ["device_id"],
)

energy_kwh_total = Gauge(
    "iot_energy_kwh_total",
    "Total energy accumulated in kWh",
    ["device_id"],
)

alerts_active_total = Gauge(
    "iot_alerts_active_total",
    "Number of active (unresolved) alerts",
    ["severity"],
)

alerts_fired_total = Counter(
    "iot_alerts_fired_total",
    "Total alerts fired",
    ["severity", "device_id"],
)

temperature_celsius = Gauge(
    "iot_temperature_celsius",
    "Current temperature reading",
    ["device_id"],
)

voltage_volts = Gauge(
    "iot_voltage_volts",
    "Current voltage reading",
    ["device_id"],
)

power_factor = Gauge(
    "iot_power_factor",
    "Power factor (dimensionless 0-1)",
    ["device_id"],
)

frequency_hz = Gauge(
    "iot_frequency_hz",
    "AC frequency in Hz",
    ["device_id"],
)
