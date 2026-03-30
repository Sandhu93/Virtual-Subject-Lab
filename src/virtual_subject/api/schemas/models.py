from __future__ import annotations

from pydantic import BaseModel, Field


class StimulusCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    source_type: str
    mime_type: str | None = None
    filename: str | None = None


class StimulusTextRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    text: str = Field(min_length=1)


class RunCreateRequest(BaseModel):
    stimulus_id: str
    ablations: list[str] = Field(default_factory=lambda: ["full"])
    atlas_id: str = "lab_curated_v1"
    normalization: str = "segment_p99"


class RoiTraceRequest(BaseModel):
    run_id: str
    ablation: str = "full"
    roi_ids: list[str] = Field(min_length=1)


class ContrastRequest(BaseModel):
    run_a_id: str
    run_b_id: str
    ablation: str = "full"
    mode: str = "mean_difference"


class ExportCreateRequest(BaseModel):
    run_id: str

