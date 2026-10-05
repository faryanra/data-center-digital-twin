"""create alarms table

Revision ID: 0001
Revises:
Create Date: 2026-10-03
"""
from __future__ import annotations
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "alarms",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("alarm_id", sa.String(length=64), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("equipment_id", sa.String(length=64), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("triggered_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cleared_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fault_type", sa.String(length=64), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_alarms_alarm_id", "alarms", ["alarm_id"])
    op.create_index("ix_alarms_triggered_at", "alarms", ["triggered_at"])
    op.create_index("ix_alarms_severity_status", "alarms", ["severity", "status"])


def downgrade() -> None:
    op.drop_index("ix_alarms_severity_status", table_name="alarms")
    op.drop_index("ix_alarms_triggered_at", table_name="alarms")
    op.drop_index("ix_alarms_alarm_id", table_name="alarms")
    op.drop_table("alarms")
