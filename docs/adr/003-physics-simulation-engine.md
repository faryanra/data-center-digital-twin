# ADR 003 — Physics Simulation Engine

**Status:** Accepted  
**Date:** 2026-10-03

## Context

Without physical sensors attached to a real data centre, the platform needs a simulation layer to generate realistic telemetry for development, testing, and demo purposes. The simulation must be replaceable with real sensor data without changing the API contract.

## Decision

Implement a `FacilitySimulator` class (`simulation/electrical/facility_sim.py`) with:

- A synchronous `tick()` method called every 5 seconds by the broadcast loop
- An ATS state machine (`_tick_generator`) with four states: STANDBY → STARTING (5 s delay) → TRANSFERRED → RECOVERY (3 s) → STANDBY
- Per-hall thermal isolation (`_hall_cooling` dict): a CRAH-A trip degrades Data Hall A cooling to 20% without affecting Data Hall B
- Fault injection via `inject_fault(fault_type)` / `clear_fault(fault_type)` for testing scenarios
- A `FacilitySnapshot` dataclass as the output contract shared by the Modbus gateway, MQTT publisher, alarm evaluator, and WebSocket broadcast

## Rationale

- **Pure Python, no async** — the tick is fast (<1 ms); wrapping in asyncio adds complexity with no benefit
- **Dataclass output contract** — typed fields prevent silent schema drift between simulator and consumers
- **Fault injection** — enables E2E tests without requiring real hardware failures
- **Physics fidelity** — the ATS timing and thermal model match real data centre behaviour closely enough for operator training

## Consequences

- Replacing simulation with real sensors requires only implementing the same `tick() → FacilitySnapshot` interface
- The 5-second tick rate is hardcoded in the broadcast loop; a configurable interval would require a settings change
- Generator state machine timing constants (5 s / 3 s) are hardcoded; override via env var if needed in production
