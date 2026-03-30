"""add contrasts table

Revision ID: 20260331_000002
Revises: 20260330_000001
Create Date: 2026-03-31 00:00:02
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260331_000002"
down_revision = "20260330_000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "contrasts",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("run_a_id", sa.String(length=32), sa.ForeignKey("runs.id"), nullable=False),
        sa.Column("run_b_id", sa.String(length=32), sa.ForeignKey("runs.id"), nullable=False),
        sa.Column("ablation", sa.String(length=32), nullable=False),
        sa.Column("mode", sa.String(length=32), nullable=False, server_default="mean_difference"),
        sa.Column("contrast_key", sa.String(length=512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False),
    )
    op.create_index("ix_contrasts_run_a_id", "contrasts", ["run_a_id"])
    op.create_index("ix_contrasts_run_b_id", "contrasts", ["run_b_id"])


def downgrade() -> None:
    op.drop_index("ix_contrasts_run_b_id", table_name="contrasts")
    op.drop_index("ix_contrasts_run_a_id", table_name="contrasts")
    op.drop_table("contrasts")
