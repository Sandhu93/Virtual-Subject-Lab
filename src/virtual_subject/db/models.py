from __future__ import annotations

from datetime import datetime

from sqlalchemy import Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from virtual_subject.db.session import Base
from virtual_subject.domain.utils import utcnow


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    owner_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    description: Mapped[str | None] = mapped_column(Text, default=None)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class Stimulus(Base):
    __tablename__ = "stimuli"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    source_type: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32), index=True)
    mime_type: Mapped[str | None] = mapped_column(String(255), default=None)
    original_filename: Mapped[str | None] = mapped_column(String(255), default=None)
    storage_key: Mapped[str | None] = mapped_column(String(512), default=None)
    text_content: Mapped[str | None] = mapped_column(Text, default=None)
    duration_seconds: Mapped[float | None] = mapped_column(Float, default=None)
    checksum_sha256: Mapped[str | None] = mapped_column(String(64), index=True, default=None)
    modalities: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    uploaded_at: Mapped[datetime | None] = mapped_column(default=None)

    metadata_row: Mapped["StimulusMetadata | None"] = relationship(back_populates="stimulus", uselist=False)


class StimulusMetadata(Base):
    __tablename__ = "stimulus_metadata"

    stimulus_id: Mapped[str] = mapped_column(ForeignKey("stimuli.id"), primary_key=True)
    transcript_text: Mapped[str | None] = mapped_column(Text, default=None)
    transcript_key: Mapped[str | None] = mapped_column(String(512), default=None)
    preview_key: Mapped[str | None] = mapped_column(String(512), default=None)
    events_key: Mapped[str | None] = mapped_column(String(512), default=None)
    extra_json: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)

    stimulus: Mapped[Stimulus] = relationship(back_populates="metadata_row")


class Run(Base):
    __tablename__ = "runs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    stimulus_id: Mapped[str] = mapped_column(ForeignKey("stimuli.id"), index=True)
    status: Mapped[str] = mapped_column(String(32), index=True)
    cache_key: Mapped[str] = mapped_column(String(64), index=True)
    subject_mode: Mapped[str] = mapped_column(String(32), default="average")
    prediction_target: Mapped[str] = mapped_column(String(32), default="cortical")
    atlas_id: Mapped[str] = mapped_column(String(64))
    normalization: Mapped[str] = mapped_column(String(32))
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    input_hash: Mapped[str] = mapped_column(String(64), index=True)
    requested_ablations: Mapped[list[str]] = mapped_column(JSON, default=list)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(default=None)
    finished_at: Mapped[datetime | None] = mapped_column(default=None)
    error_message: Mapped[str | None] = mapped_column(Text, default=None)


class RunAblation(Base):
    __tablename__ = "run_ablations"
    __table_args__ = (UniqueConstraint("run_id", "ablation", name="uq_run_ablation"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id"), index=True)
    ablation: Mapped[str] = mapped_column(String(32), index=True)
    status: Mapped[str] = mapped_column(String(32), index=True)
    tensor_key: Mapped[str | None] = mapped_column(String(512), default=None)
    roi_traces_key: Mapped[str | None] = mapped_column(String(512), default=None)
    preview_key: Mapped[str | None] = mapped_column(String(512), default=None)
    sample_rate_hz: Mapped[float | None] = mapped_column(Float, default=None)
    n_timesteps: Mapped[int | None] = mapped_column(Integer, default=None)
    n_vertices: Mapped[int | None] = mapped_column(Integer, default=None)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(default=None)


class RoiSummary(Base):
    __tablename__ = "roi_summaries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_ablation_id: Mapped[str] = mapped_column(ForeignKey("run_ablations.id"), index=True)
    roi_id: Mapped[str] = mapped_column(String(64), index=True)
    roi_label: Mapped[str] = mapped_column(String(255))
    base_roi: Mapped[str] = mapped_column(String(64), index=True)
    hemisphere: Mapped[str] = mapped_column(String(16), index=True)
    mean_response: Mapped[float] = mapped_column(Float)
    peak_response: Mapped[float] = mapped_column(Float)
    peak_time_seconds: Mapped[float] = mapped_column(Float)
    auc: Mapped[float] = mapped_column(Float)
    laterality_index: Mapped[float | None] = mapped_column(Float, default=None)
    rank_global: Mapped[int | None] = mapped_column(Integer, default=None)


class Export(Base):
    __tablename__ = "exports"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id"), index=True)
    status: Mapped[str] = mapped_column(String(32), index=True)
    bundle_key: Mapped[str | None] = mapped_column(String(512), default=None)
    manifest_key: Mapped[str | None] = mapped_column(String(512), default=None)
    error_message: Mapped[str | None] = mapped_column(Text, default=None)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(default=None)


class Artifact(Base):
    __tablename__ = "artifacts"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    owner_type: Mapped[str] = mapped_column(String(32), index=True)
    owner_id: Mapped[str] = mapped_column(String(32), index=True)
    artifact_type: Mapped[str] = mapped_column(String(64))
    storage_key: Mapped[str] = mapped_column(String(512), index=True)
    checksum_sha256: Mapped[str] = mapped_column(String(64))
    size_bytes: Mapped[int] = mapped_column(Integer)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), default=None, index=True)
    action: Mapped[str] = mapped_column(String(64), index=True)
    target_type: Mapped[str] = mapped_column(String(32), index=True)
    target_id: Mapped[str] = mapped_column(String(32), index=True)
    payload_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), index=True)
    owner_id: Mapped[str] = mapped_column(String(32), index=True)
    status: Mapped[str] = mapped_column(String(32), index=True)
    payload_json: Mapped[dict] = mapped_column(JSON, default=dict)
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, default=None)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    available_at: Mapped[datetime] = mapped_column(default=utcnow, index=True)
    claimed_at: Mapped[datetime | None] = mapped_column(default=None)
    finished_at: Mapped[datetime | None] = mapped_column(default=None)


class WorkerHeartbeat(Base):
    __tablename__ = "worker_heartbeats"

    worker_name: Mapped[str] = mapped_column(String(64), primary_key=True)
    status: Mapped[str] = mapped_column(String(32))
    mode: Mapped[str] = mapped_column(String(16))
    detail_json: Mapped[dict] = mapped_column(JSON, default=dict)
    last_seen_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)

