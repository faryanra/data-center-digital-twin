#!/usr/bin/env bash
# EC2 bootstrap for the DC-NORTH-01 Data Center Digital Twin.
# Run as root (e.g. via EC2 user-data or `sudo bash ec2-bootstrap.sh`).
#
# Prerequisites: Amazon Linux 2023 or Ubuntu 22.04
# Required env vars (set before calling, or edit the defaults below):
#   APP_DIR      — where to clone the repo   (default: /opt/dc-digital-twin)
#   GIT_REPO     — git clone URL
#   JWT_SECRET, POSTGRES_PASSWORD, GRAFANA_PASSWORD — required secrets

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/dc-digital-twin}"
GIT_REPO="${GIT_REPO:-https://github.com/faryanra/data-center-digital-twin.git}"

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
JWT_SECRET=${JWT_SECRET:?JWT_SECRET must be set}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set}
GRAFANA_PASSWORD=${GRAFANA_PASSWORD:?GRAFANA_PASSWORD must be set}
API_KEY=${API_KEY:-}
CORS_ORIGINS=${CORS_ORIGINS:-}
EOF
chmod 600 .env

# ── 4. Build and start the stack ──────────────────────────────────────────────
docker compose -f docker-compose.yml up -d --build --remove-orphans

PUBLIC_IP="$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)"
echo "DC-NORTH-01 digital twin deployed to $APP_DIR"
echo "  Frontend: http://$PUBLIC_IP:3000"
echo "  API:      http://$PUBLIC_IP:8000"
echo "  Grafana:  http://$PUBLIC_IP:3001"
