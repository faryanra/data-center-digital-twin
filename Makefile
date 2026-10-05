.PHONY: up down build dev logs ps clean lint typecheck test

# ── Docker stack ──────────────────────────────────────────────────────────────

up:
	docker compose up -d

down:
	docker compose down

build:
	docker compose build --no-cache

logs:
	docker compose logs -f

ps:
	docker compose ps

clean:
	docker compose down -v --remove-orphans

# ── Frontend (apps/web) ───────────────────────────────────────────────────────

dev:
	cd apps/web && npm run dev

web-install:
	cd apps/web && npm ci

web-build:
	cd apps/web && npm run build

typecheck:
	cd apps/web && npm run typecheck

test-e2e:
	cd apps/web && npm run test:e2e

# ── Python services ───────────────────────────────────────────────────────────

py-check:
	python -m compileall -q common/ services/api/

lint:
	python -m py_compile common/*.py services/api/*.py

# ── Facility simulation ───────────────────────────────────────────────────────

facility-validate:
	python -c "import yaml; yaml.safe_load(open('simulation/facility/dc-north-01.yaml'))" && echo "YAML OK"
