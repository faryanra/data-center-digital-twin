from common.settings import get_settings


def test_settings_read_environment(monkeypatch):
    monkeypatch.setenv("MQTT_HOST", "broker.internal")
    monkeypatch.setenv("API_PORT", "9000")

    settings = get_settings()

    assert settings.mqtt_host == "broker.internal"
    assert settings.api_port == 9000
