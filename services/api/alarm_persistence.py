from __future__ import annotations

import datetime
import logging
from datetime import timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models_db import AlarmRecord

logger = logging.getLogger(__name__)


async def upsert_alarm(db: AsyncSession, alarm: dict) -> None:
    try:
        existing = (await db.execute(
            select(AlarmRecord).where(AlarmRecord.alarm_id == alarm["alarm_id"])
        )).scalar_one_or_none()
        if existing:
            existing.status = alarm.get("status", existing.status)
            existing.acknowledged_at = alarm.get("acknowledged_at")
            existing.cleared_at = alarm.get("cleared_at")
        else:
            db.add(AlarmRecord(
                alarm_id=alarm["alarm_id"],
                severity=alarm.get("severity", "WARNING"),
                status=alarm.get("status", "ACTIVE"),
                equipment_id=alarm.get("equipment_id", "unknown"),
                message=alarm.get("message", ""),
                triggered_at=alarm.get("triggered_at") or datetime.datetime.now(timezone.utc),
                fault_type=alarm.get("fault_type"),
            ))
        await db.commit()
    except Exception as exc:
        logger.error("persist alarm %s: %s", alarm.get("alarm_id"), exc)
        await db.rollback()


async def query_alarm_history(
    db: AsyncSession,
    severity: str | None = None,
    status: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[AlarmRecord]:
    q = select(AlarmRecord).order_by(AlarmRecord.triggered_at.desc())
    if severity:
        q = q.where(AlarmRecord.severity == severity)
    if status:
        q = q.where(AlarmRecord.status == status)
    return list((await db.execute(q.limit(limit).offset(offset))).scalars())
