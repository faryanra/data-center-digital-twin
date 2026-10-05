# ADR 004 — Modbus TCP Industrial Interface

**Status:** Accepted  
**Date:** 2026-10-03

## Context

Data centres use industrial protocols (Modbus, BACnet, SNMP) to communicate with UPS units, PDUs, CRAHs, and generators. The platform needs to expose simulated register data over Modbus TCP to allow testing with real SCADA/BMS tools without modifying those tools.

## Decision

Run a Modbus TCP server (`services/api/modbus_gateway.py`) on port 5020 using `pymodbus 3.7.x`:

- 4 slave addresses: UPS=1, PDU=2, CRAH=3, Generator=4
- 16 holding registers per slave (6 used; layout: voltage, current, power, energy, power_factor, frequency)
- `update_registers_from_snapshot(snapshot)` called every tick to write current simulation values
- Device register profiles in `config/device_profiles/*.yaml` describe register metadata, scaling, units, and alarm thresholds
- `device_profile_loader.py` validates register values against profiles and exposes `/modbus/devices` and `/modbus/registers` REST endpoints

## Rationale

- **Standard protocol** — any Modbus master (SCADA, test tool, Python `pymodbus` client) can read the registers without custom integration
- **Register layout stability** — 6-register layout (holding registers 0–5) must not change; existing tools cache register addresses
- **Profile-driven metadata** — YAML profiles decouple register semantics from code; adding a new device type requires only a new YAML file

## Consequences

- Port 5020 must be exposed in both `docker-compose.yml` and any cloud security group / firewall rules
- The Modbus server runs as an `asyncio.Task` inside the FastAPI lifespan; a crash is logged but does not take down the API
- Scaling factors are baked into `update_registers_from_snapshot`; changing them is a breaking change for existing Modbus clients
