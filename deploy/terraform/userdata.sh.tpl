#!/bin/bash
set -e
apt-get update -y
apt-get install -y docker.io docker-compose-plugin
systemctl enable docker
systemctl start docker

# Pull images from GHCR (public registry — no auth required for public repos)
docker pull ${repo}/api:${image_tag}
docker pull ${repo}/frontend:${image_tag}

# Write production compose referencing the pulled images
mkdir -p /opt/dc-digital-twin
cat > /opt/dc-digital-twin/docker-compose.prod.yml <<'EOF'
name: dc-digital-twin-prod

services:
  frontend:
    image: ${repo}/frontend:${image_tag}
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://api:8000
    depends_on:
      api:
        condition: service_healthy

  api:
    image: ${repo}/api:${image_tag}
    restart: unless-stopped
    ports:
      - "8000:8000"
      - "5020:5020"
    environment:
      MQTT_HOST: mosquitto
      MQTT_PORT: "1883"
      MODBUS_PORT: "5020"
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]
      interval: 30s
      timeout: 10s
      retries: 3
    depends_on:
      - mosquitto

  mosquitto:
    image: eclipse-mosquitto:2.0
    restart: unless-stopped
    ports:
      - "1883:1883"

volumes:
  mosquitto_data:
EOF

docker compose -f /opt/dc-digital-twin/docker-compose.prod.yml up -d
