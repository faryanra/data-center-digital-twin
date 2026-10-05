# ADR 001 — Monorepo Structure

**Status:** Accepted  
**Date:** 2026-10-03

## Context

The Data Center Digital Twin spans multiple distinct runtimes: a Next.js frontend, a FastAPI backend, Python simulation engines, IoT sensor scripts, and infrastructure configuration. We needed to decide whether to use separate repositories or a single monorepo.

## Decision

Use a single Git repository with logical subdirectory groupings:

```
apps/web/          Next.js 16 frontend
services/api/      FastAPI backend
services/simulation/ IoT sensor simulators
packages/types/    Shared TypeScript types
simulation/        Facility model + physics engine
common/            Shared Python modules
config/            Device profiles, Mosquitto, server configs
infrastructure/    Prometheus, Grafana, Mosquitto Docker configs
infra/terraform/   ECS Fargate Terraform
docs/              Architecture docs, ADRs
```

## Rationale

- **Atomic commits** across frontend + backend + types when an interface changes
- **Single CI pipeline** can validate cross-layer contracts (TypeScript types match Python data shapes)
- **Shared fixture data** (facility YAML) referenced by both simulation and API without a publish step
- The team is small; the coordination overhead of multiple repos outweighs the isolation benefit

## Consequences

- Docker builds must use `context: .` (repo root) to access `common/`, `simulation/`, `config/` from the API Dockerfile
- `tsconfig.tsbuildinfo` must be `.gitignore`'d to avoid spurious diffs from incremental TS builds
- CI cache keys are per-subdirectory (`cache-dependency-path: apps/web/package-lock.json`)
