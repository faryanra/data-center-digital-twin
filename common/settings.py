"""Environment-based settings shared by the Python services."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

_LOG = logging.getLogger(__name__)


def _value(name: str, default: str) -> str:
    return os.getenv(name, default).strip()


def _port(name: str, default: int) -> int:
    value = _value(name, str(default))
    try:
        port = int(value)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer") from exc
    if not 1 <= port <= 65535:
        raise ValueError(f"{name} must be between 1 and 65535")
    return port


@dataclass(frozen=True)
class Settings:
    postgres_host: str
    postgres_port: int
    postgres_db: str
    postgres_user: str
    postgres_password: str
    mqtt_host: str
    mqtt_port: int
    mqtt_telemetry_topic: str
    mqtt_alert_topic: str
    api_host: str
    api_port: int
    telegram_bot_token: str
    telegram_chat_id: str
    catalog_url: str
    database_url: str
    api_key: str
    cors_origins: str
    snmp_devices_json: str

    @property
    def postgres_dsn(self) -> str:
        if self.database_url:
            return self.database_url
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


_DEFAULT_PG_PASSWORD = "smarthome"


def get_settings() -> Settings:
    settings = Settings(
        postgres_host=_value("POSTGRES_HOST", "localhost"),
        postgres_port=_port("POSTGRES_PORT", 5432),
        postgres_db=_value("POSTGRES_DB", "dc_north_01"),
        postgres_user=_value("POSTGRES_USER", "dc_admin"),
        postgres_password=_value("POSTGRES_PASSWORD", _DEFAULT_PG_PASSWORD),
        mqtt_host=_value("MQTT_HOST", "localhost"),
        mqtt_port=_port("MQTT_PORT", 1883),
        mqtt_telemetry_topic=_value("MQTT_TELEMETRY_TOPIC", "dc/facility/snapshot"),
        mqtt_alert_topic=_value("MQTT_ALERT_TOPIC", "dc/facility/alarms"),
        api_host=_value("API_HOST", "0.0.0.0"),
        api_port=_port("API_PORT", 8000),
        telegram_bot_token=_value("TELEGRAM_BOT_TOKEN", ""),
        telegram_chat_id=_value("TELEGRAM_CHAT_ID", ""),
        catalog_url=_value("CATALOG_URL", "http://127.0.0.1:8081"),
        database_url=_value("DATABASE_URL", ""),
        api_key=_value("API_KEY", ""),
        cors_origins=_value("CORS_ORIGINS", ""),
        snmp_devices_json=_value("SNMP_DEVICES_JSON", ""),
    )
    if not settings.database_url and settings.postgres_password == _DEFAULT_PG_PASSWORD:
        _LOG.warning(
            "POSTGRES_PASSWORD is set to the default development value; "
            "set POSTGRES_PASSWORD explicitly before deploying to production"
        )
    return settings
