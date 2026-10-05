#!/usr/bin/env bash
# EC2 bootstrap script for SmartHome-IoT platform
# Run as root (e.g. via EC2 user-data or `sudo bash ec2-bootstrap.sh`)
#
# Prerequisites: Amazon Linux 2023 or Ubuntu 22.04
# Required env vars (set before calling, or edit the defaults below):
#   APP_DIR      — where to clone the repo       (default: /opt/smarthome-iot)
#   GIT_REPO     — git clone URL
#   POSTGRES_PASSWORD, API_KEY, GRAFANA_PASSWORD  — required secrets

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/smarthome-iot}"
GIT_REPO="${GIT_REPO:-https://github.com/your-org/SmartHome-IoT.git}"

# ── 1. System packages ────────────────────────────────────────────────────────
if command -v dnf &>/dev/null; then
    dnf update -y
    dnf install -y git docker
    systemctl enable --now docker
elif command -v apt-get &>/dev/null; then
    apt-get update -y
    apt-get install -y git ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
        https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
        > /etc/apt/sources.list.d/docker.list
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable --now docker
fi

# ── 2. Clone or update the repo ───────────────────────────────────────────────
if [[ -d "$APP_DIR/.git" ]]; then
    git -C "$APP_DIR" pull --ff-only
else
    git clone "$GIT_REPO" "$APP_DIR"
fi
cd "$APP_DIR"

# ── 3. Write .env from environment variables ──────────────────────────────────
cat > .env <<EOF
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set}
API_KEY=${API_KEY:?API_KEY must be set}
GRAFANA_PASSWORD=${GRAFANA_PASSWORD:?GRAFANA_PASSWORD must be set}
CORS_ORIGINS=${CORS_ORIGINS:-}
GRAFANA_ROOT_URL=${GRAFANA_ROOT_URL:-}
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN:-}
TELEGRAM_CHAT_ID=${TELEGRAM_CHAT_ID:-}
EOF
chmod 600 .env

# ── 4. Start the stack (cloud mode — no sensor simulators) ────────────────────
docker compose \
    -f docker-compose.yml \
    -f docker-compose.cloud.yml \
    up -d --build --remove-orphans

echo "SmartHome-IoT deployed to $APP_DIR"
echo "  API:      http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):8000"
echo "  Frontend: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)"
echo "  Grafana:  http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):3001"
