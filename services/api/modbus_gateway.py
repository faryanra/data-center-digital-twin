"""
Modbus TCP gateway — exposes FacilitySnapshot state as holding registers.

Register map (all holding registers, function code 3, unsigned 16-bit):
  Slave 1 — UPS-01
    addr 0: input_voltage_v * 10   (4000 = 400.0 V; 0 on battery)
    addr 1: output_voltage_v * 10
    addr 2: load_pct * 10          (650 = 65.0 %)
    addr 3: battery_pct * 10
    addr 4: mode  0=NORMAL 1=BATTERY 2=BYPASS 3=FAULT

  Slave 2 — PDU-A1 (Data Hall A)
    addr 0: it_load_kw * 10
    addr 1: phase_a_kw * 10        (balanced: load / 3)
    addr 2: phase_b_kw * 10
    addr 3: phase_c_kw * 10
    addr 4: load_pct * 10          (of PDU rating)

  Slave 3 — CRAH (cooling plant)
    addr 0: supply_temp_c * 10     (follows the CRAH setpoint)
    addr 1: return_temp_c * 10
    addr 2: cooling_power_kw * 10
    addr 3: fan_speed_pct * 10     (800 = 80 %; rises when units are offline)
    addr 4: units_online

  Slave 4 — Generator-01
    addr 0: state  0=STANDBY 1=STARTING 2=TRANSFERRED 3=RECOVERY 4=FAULT
    addr 1: output_kw * 10         (UPS load while carrying it, else 0)
    addr 2: frequency_hz * 100     (5000 = 50.00 Hz while carrying load, else 0)
    addr 3: fuel_pct * 10
"""

from __future__ import annotations

import logging

from pymodbus.datastore import (
    ModbusSequentialDataBlock,
    ModbusServerContext,
    ModbusSlaveContext,
)
from pymodbus.device import ModbusDeviceIdentification
from pymodbus.server import StartAsyncTcpServer

logger = logging.getLogger(__name__)

_UPS_MODE_CODE = {"NORMAL": 0, "BATTERY": 1, "BYPASS": 2, "FAULT": 3}
_GEN_STATE_CODE = {
    "STANDBY": 0, "STARTING": 1, "TRANSFERRED": 2, "RECOVERY": 3, "FAULT": 4,
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


def _reg(value: float, scale: float = 10) -> int:
    """Scale to an unsigned 16-bit register value."""
    return max(0, min(65535, round(value * scale)))


def _set(store: ModbusServerContext, slave_id: int, values: list[int]) -> None:
    try:
        store[slave_id].setValues(3, 0, values)
    except Exception as exc:
        logger.debug("modbus set slave=%d error=%s", slave_id, exc)


def build_register_values(snapshot) -> dict[int, list[int]]:
    """Map a FacilitySnapshot to holding-register values per slave id."""
    ups = snapshot.ups
    pdu = snapshot.pdus[0]
    cooling = snapshot.cooling

    pdu_kw = pdu.it_load_w / 1000
    online, total = cooling.crah_online_count, max(cooling.crah_total_count, 1)
    fan_pct = min(100.0, 80.0 * total / max(online, 1))

    carrying = snapshot.power_source == "GENERATOR"
    gen_kw = ups.output_load_w / 1000 if carrying else 0.0
    gen_hz = ups.frequency_hz if carrying else 0.0

    return {
        1: [
            _reg(ups.input_voltage_v), _reg(ups.output_voltage_v),
            _reg(ups.load_percent), _reg(ups.battery_soc * 100),
            _UPS_MODE_CODE.get(ups.mode, 3),
        ],
        2: [_reg(pdu_kw)] + [_reg(pdu_kw / 3)] * 3 + [_reg(pdu.load_factor * 100)],
        3: [
            _reg(cooling.supply_temp_c), _reg(cooling.return_temp_c),
            _reg(cooling.cooling_power_w / 1000), _reg(fan_pct), online,
        ],
        4: [
            _GEN_STATE_CODE.get(snapshot.generator_state, 0),
            _reg(gen_kw), _reg(gen_hz, 100), _reg(snapshot.generator_fuel_pct),
        ],
    }


def update_registers_from_snapshot(snapshot) -> None:
    """Update all Modbus registers from the latest FacilitySnapshot."""
    store = get_store()
    try:
        for slave_id, values in build_register_values(snapshot).items():
            _set(store, slave_id, values)
    except Exception as exc:
        logger.debug("Modbus register update: %s", exc)


async def run_modbus_server(host: str = "127.0.0.1", port: int = 5020) -> None:
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
