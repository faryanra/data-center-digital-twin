# ADR 002 — WebSocket Real-Time Push

**Status:** Accepted  
**Date:** 2026-10-03

## Context

The dashboard must show live PUE, IT load, alarm counts, generator state, and per-hall cooling — all updating without user interaction. Options considered: polling REST, Server-Sent Events (SSE), WebSocket.

## Decision

Use a persistent WebSocket at `/ws/facility`. The FastAPI backend broadcasts a `WsFacilitySnapshot` JSON blob every 5 seconds from a background `sim_broadcast_loop` task started in the lifespan context.

## Rationale

- **Bi-directional** — future fault injection from the UI requires client→server messaging; SSE cannot do this
- **One connection, all data** — a single WS replaces multiple polling intervals for different KPIs
- **Native FastAPI support** — `WebSocket`, `WebSocketDisconnect`, and `ConnectionManager` pattern require no extra dependencies
- **5-second cadence** matches the simulator tick rate; sub-second updates would waste bandwidth with no fidelity gain

## Consequences

- Clients must implement reconnect logic (the frontend `useFacilitySocket` hook handles this with exponential backoff)
- The `WsFacilitySnapshot` TypeScript interface in `@dctwin/types` is the contract between frontend and backend — changes must be coordinated
- WebSocket connections are not authenticated in Phase 1; a token-in-query-param pattern should be added before production
