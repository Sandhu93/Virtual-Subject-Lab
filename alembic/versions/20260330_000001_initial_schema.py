"""initial schema

Revision ID: 20260330_000001
Revises:
Create Date: 2026-03-30 00:00:01
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260330_000001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "projects",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("owner_user_id", sa.String(length=32), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False),
    )
    op.create_index("ix_projects_name", "projects", ["name"], unique=False)
    op.create_index("ix_projects_owner_user_id", "projects", ["owner_user_id"], unique=False)

    op.create_table(
        "stimuli",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("project_id", sa.String(length=32), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("source_type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("mime_type", sa.String(length=255), nullable=True),
        sa.Column("original_filename", sa.String(length=255), nullable=True),
        sa.Column("storage_key", sa.String(length=512), nullable=True),
        sa.Column("text_content", sa.Text(), nullable=True),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("checksum_sha256", sa.String(length=64), nullable=True),
        sa.Column("modalities", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=False), nullable=True),
    )
    op.create_index("ix_stimuli_project_id", "stimuli", ["project_id"], unique=False)
    op.create_index("ix_stimuli_status", "stimuli", ["status"], unique=False)
    op.create_index("ix_stimuli_checksum_sha256", "stimuli", ["checksum_sha256"], unique=False)

    op.create_table(
        "stimulus_metadata",
        sa.Column("stimulus_id", sa.String(length=32), sa.ForeignKey("stimuli.id"), primary_key=True),
        sa.Column("transcript_text", sa.Text(), nullable=True),
        sa.Column("transcript_key", sa.String(length=512), nullable=True),
        sa.Column("preview_key", sa.String(length=512), nullable=True),
        sa.Column("events_key", sa.String(length=512), nullable=True),
        sa.Column("extra_json", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=False), nullable=False),
    )

    op.create_table(
        "runs",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("project_id", sa.String(length=32), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("stimulus_id", sa.String(length=32), sa.ForeignKey("stimuli.id"), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("cache_key", sa.String(length=64), nullable=False),
        sa.Column("subject_mode", sa.String(length=32), nullable=False),
        sa.Column("prediction_target", sa.String(length=32), nullable=False),
        sa.Column("atlas_id", sa.String(length=64), nullable=False),
        sa.Column("normalization", sa.String(length=32), nullable=False),
        sa.Column("created_by", sa.String(length=32), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("input_hash", sa.String(length=64), nullable=False),
        sa.Column("requested_ablations", sa.JSON(), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=False), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=False), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
    )
    for index_name, column_name in [
        ("ix_runs_project_id", "project_id"),
        ("ix_runs_stimulus_id", "stimulus_id"),
        ("ix_runs_status", "status"),
        ("ix_runs_cache_key", "cache_key"),
        ("ix_runs_created_by", "created_by"),
        ("ix_runs_input_hash", "input_hash"),
    ]:
        op.create_index(index_name, "runs", [column_name], unique=False)

    op.create_table(
        "run_ablations",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("run_id", sa.String(length=32), sa.ForeignKey("runs.id"), nullable=False),
        sa.Column("ablation", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("tensor_key", sa.String(length=512), nullable=True),
        sa.Column("roi_traces_key", sa.String(length=512), nullable=True),
        sa.Column("preview_key", sa.String(length=512), nullable=True),
        sa.Column("sample_rate_hz", sa.Float(), nullable=True),
        sa.Column("n_timesteps", sa.Integer(), nullable=True),
        sa.Column("n_vertices", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=False), nullable=True),
        sa.UniqueConstraint("run_id", "ablation", name="uq_run_ablation"),
    )
    op.create_index("ix_run_ablations_run_id", "run_ablations", ["run_id"], unique=False)
    op.create_index("ix_run_ablations_ablation", "run_ablations", ["ablation"], unique=False)
    op.create_index("ix_run_ablations_status", "run_ablations", ["status"], unique=False)

    op.create_table(
        "roi_summaries",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("run_ablation_id", sa.String(length=32), sa.ForeignKey("run_ablations.id"), nullable=False),
        sa.Column("roi_id", sa.String(length=64), nullable=False),
        sa.Column("roi_label", sa.String(length=255), nullable=False),
        sa.Column("base_roi", sa.String(length=64), nullable=False),
        sa.Column("hemisphere", sa.String(length=16), nullable=False),
        sa.Column("mean_response", sa.Float(), nullable=False),
        sa.Column("peak_response", sa.Float(), nullable=False),
        sa.Column("peak_time_seconds", sa.Float(), nullable=False),
        sa.Column("auc", sa.Float(), nullable=False),
        sa.Column("laterality_index", sa.Float(), nullable=True),
        sa.Column("rank_global", sa.Integer(), nullable=True),
    )
    for index_name, column_name in [
        ("ix_roi_summaries_run_ablation_id", "run_ablation_id"),
        ("ix_roi_summaries_roi_id", "roi_id"),
        ("ix_roi_summaries_base_roi", "base_roi"),
        ("ix_roi_summaries_hemisphere", "hemisphere"),
    ]:
        op.create_index(index_name, "roi_summaries", [column_name], unique=False)

    op.create_table(
        "exports",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("run_id", sa.String(length=32), sa.ForeignKey("runs.id"), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("bundle_key", sa.String(length=512), nullable=True),
        sa.Column("manifest_key", sa.String(length=512), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=False), nullable=True),
    )
    op.create_index("ix_exports_run_id", "exports", ["run_id"], unique=False)
    op.create_index("ix_exports_status", "exports", ["status"], unique=False)

    op.create_table(
        "artifacts",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("owner_type", sa.String(length=32), nullable=False),
        sa.Column("owner_id", sa.String(length=32), nullable=False),
        sa.Column("artifact_type", sa.String(length=64), nullable=False),
        sa.Column("storage_key", sa.String(length=512), nullable=False),
        sa.Column("checksum_sha256", sa.String(length=64), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False),
    )
    for index_name, column_name in [
        ("ix_artifacts_owner_type", "owner_type"),
        ("ix_artifacts_owner_id", "owner_id"),
        ("ix_artifacts_storage_key", "storage_key"),
    ]:
        op.create_index(index_name, "artifacts", [column_name], unique=False)

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.String(length=32), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("target_type", sa.String(length=32), nullable=False),
        sa.Column("target_id", sa.String(length=32), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False),
    )
    for index_name, column_name in [
        ("ix_audit_logs_user_id", "user_id"),
        ("ix_audit_logs_action", "action"),
        ("ix_audit_logs_target_type", "target_type"),
        ("ix_audit_logs_target_id", "target_id"),
    ]:
        op.create_index(index_name, "audit_logs", [column_name], unique=False)

    op.create_table(
        "jobs",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("owner_id", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("progress", sa.Float(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False),
        sa.Column("available_at", sa.DateTime(timezone=False), nullable=False),
        sa.Column("claimed_at", sa.DateTime(timezone=False), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=False), nullable=True),
    )
    for index_name, column_name in [
        ("ix_jobs_kind", "kind"),
        ("ix_jobs_owner_id", "owner_id"),
        ("ix_jobs_status", "status"),
        ("ix_jobs_available_at", "available_at"),
    ]:
        op.create_index(index_name, "jobs", [column_name], unique=False)

    op.create_table(
        "worker_heartbeats",
        sa.Column("worker_name", sa.String(length=64), primary_key=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("mode", sa.String(length=16), nullable=False),
        sa.Column("detail_json", sa.JSON(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=False), nullable=False),
    )


def downgrade() -> None:
    for table in [
        "worker_heartbeats",
        "jobs",
        "audit_logs",
        "artifacts",
        "exports",
        "roi_summaries",
        "run_ablations",
        "runs",
        "stimulus_metadata",
        "stimuli",
        "projects",
        "users",
    ]:
        op.drop_table(table)
