"""
Modbus TCP gateway — exposes FacilitySnapshot state as holding registers.

Register map (all holding registers, function code 3):
  Slave 1 — UPS-01
    addr 0: input_voltage_v * 10   (e.g. 4000 = 400.0 V)
    addr 1: output_voltage_v * 10
    addr 2: load_pct * 10          (e.g. 650 = 65.0 %)
    addr 3: battery_pct * 10
    addr 4: status  0=ON_LINE 1=ON_BATTERY 2=BYPASS 3=FAULT

  Slave 2 — PDU-A1
    addr 0: total_kw * 10
    addr 1: phase_a_kw * 10
    addr 2: phase_b_kw * 10
    addr 3: phase_c_kw * 10

  Slave 3 — CRAH-A
    addr 0: supply_temp_c * 10
    addr 1: return_temp_c * 10
    addr 2: cooling_kw * 10
    addr 3: fan_speed_pct * 10   (fixed 800 = 80.0 %)

  Slave 4 — Generator-01
    addr 0: state  0=STANDBY 1=STARTING 2=TRANSFERRED 3=RECOVERY
    addr 1: output_kw * 10
"""

from __future__ import annotations
import asyncio
import logging
from pymodbus.datastore import (
    ModbusSlaveContext,
    ModbusServerContext,
    ModbusSequentialDataBlock,
)
from pymodbus.server import StartAsyncTcpServer
from pymodbus.device import ModbusDeviceIdentification

logger = logging.getLogger(__name__)

_GEN_STATE_CODE = {
    "STANDBY": 0, "STARTING": 1, "TRANSFERRED": 2, "RECOVERY": 3
}

_store: ModbusServerContext | None = None


def _make_context() -> ModbusServerContext:
    def slave() -> ModbusSlaveContext:
        return ModbusSlaveContext(hr=ModbusSequentialDataBlock(0, [0] * 16))
    return ModbusServerContext(
        slaves={1: slave(), 2: slave(), 3: slave(), 4: slave()},
        single=False,
    )


def get_store() -> ModbusServerContext:
    global _store
    if _store is None:
        _store = _make_context()
    return _store


def _set(store: ModbusServerContext, slave_id: int, values: list[int]) -> None:
    try:
        store[slave_id].setValues(3, 0, values)
    except Exception as exc:
        logger.debug("modbus set slave=%d error=%s", slave_id, exc)


def update_registers_from_snapshot(snapshot) -> None:
    """Update all Modbus registers from the latest FacilitySnapshot."""
    store = get_store()

    # --- UPS (slave 1) ---
    try:
        ups      = snapshot.ups
        input_v  = int(ups.input_voltage_v * 10)
        output_v = int(ups.output_voltage_v * 10)
        load_p   = int(ups.load_percent * 10)
        bat_p    = int(ups.battery_soc * 100 * 10)
        status_c = 1 if ups.mode == "BATTERY" else (2 if ups.mode == "BYPASS" else (3 if ups.mode == "FAULT" else 0))
        _set(store, 1, [input_v, output_v, load_p, bat_p, status_c])
    except Exception as exc:
        logger.debug("UPS register update: %s", exc)

    # --- PDU (slave 2) ---
    try:
        kw = float(getattr(snapshot, "total_it_kw", 0) or 0)
        _set(store, 2, [int(kw * 10)] + [int(kw / 3 * 10)] * 3)
    except Exception as exc:
        logger.debug("PDU register update: %s", exc)

    # --- CRAH (slave 3) ---
    try:
        st  = int(float(getattr(snapshot, "supply_temp_c",   18.0) or 18.0) * 10)
        rt  = int(float(getattr(snapshot, "return_temp_c",   24.0) or 24.0) * 10)
        ckw = int(float(getattr(snapshot, "total_cooling_kw", 500.0) or 500.0) * 10)
        _set(store, 3, [st, rt, ckw, 800])
    except Exception as exc:
        logger.debug("CRAH register update: %s", exc)

    # --- Generator (slave 4) ---
    try:
        gen_s = str(getattr(snapshot, "generator_state", "STANDBY"))
        gen_c = _GEN_STATE_CODE.get(gen_s, 0)
        kw    = int(float(getattr(snapshot, "total_it_kw", 0) or 0) * 10)
        _set(store, 4, [gen_c, kw, 5000, 500])   # freq placeholder 50.0 Hz
    except Exception as exc:
        logger.debug("Generator register update: %s", exc)


async def run_modbus_server(host: str = "0.0.0.0", port: int = 5020) -> None:
    identity = ModbusDeviceIdentification(
        info_name={
            "VendorName": "DCTwin",
            "ProductCode": "DC-DT-GW",
            "ProductName": "Data Center Digital Twin Modbus Gateway",
            "ModelName": "ModbusGW-1.0",
            "MajorMinorRevision": "1.0",
        }
    )
    logger.info("Modbus TCP server listening on %s:%d", host, port)
    await StartAsyncTcpServer(
        context=get_store(),
        identity=identity,
        address=(host, port),
    )
