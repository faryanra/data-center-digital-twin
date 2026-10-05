# Deploying SmartHome-IoT to EC2

## Prerequisites

- An EC2 instance: **t3.medium** or larger (2 vCPU, 4 GB RAM minimum)
- AMI: Amazon Linux 2023 or Ubuntu 22.04 LTS
- Security group inbound rules:
  | Port | Purpose |
  |------|---------|
  | 22   | SSH |
  | 80   | Frontend (Next.js) |
  | 8000 | FastAPI backend |
  | 1883 | MQTT (restrict to trusted CIDRs) |
  | 3001 | Grafana |
  | 9090 | Prometheus (restrict to trusted CIDRs) |
- An IAM instance profile is not required for a single-node deploy.

## Quick start

```bash
# 1. SSH into your instance
ssh -i your-key.pem ec2-user@<PUBLIC_IP>

# 2. Export required secrets
export POSTGRES_PASSWORD="$(openssl rand -hex 16)"
export API_KEY="$(openssl rand -hex 24)"
export GRAFANA_PASSWORD="$(openssl rand -hex 12)"
export GIT_REPO="https://github.com/your-org/SmartHome-IoT.git"

# 3. Run bootstrap
curl -fsSL https://raw.githubusercontent.com/your-org/SmartHome-IoT/main/deploy/ec2-bootstrap.sh \
  | sudo -E bash
```

## What the bootstrap does

1. Installs Docker (or updates it if already present)
2. Clones (or pulls) the repository to `/opt/smarthome-iot`
3. Writes a `.env` file with your secrets
4. Starts the production stack via `docker compose -f docker-compose.yml -f docker-compose.cloud.yml up -d`

The cloud overlay:
- **Excludes sensor simulators** (they use the `local-sensors` profile, which is off by default)
- Binds the frontend to port 80
- Sets `restart: always` on every service
- Reads `API_KEY`, `POSTGRES_PASSWORD`, and `GRAFANA_PASSWORD` from the environment

## Running with local sensor simulators

If you want the simulators running on the EC2 host (e.g. for a demo):

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.cloud.yml \
  --profile local-sensors \
  up -d
```

## Updating

```bash
cd /opt/smarthome-iot
git pull
docker compose -f docker-compose.yml -f docker-compose.cloud.yml up -d --build
```

## Enabling MQTT authentication

Follow the [MQTT Security section](../README.md#mqtt-security) of the README, then
layer `docker-compose.prod.yml` on top:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.cloud.yml \
  -f docker-compose.prod.yml \
  up -d
```
