from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np

from virtual_subject.domain.constants import (
    CURATED_ROIS,
    DEFAULT_ATLAS_ID,
    DEFAULT_SAMPLE_RATE_HZ,
    HEMISPHERE_VERTEX_COUNT,
)


@dataclass(frozen=True)
class AtlasRoi:
    roi_id: str
    base_roi: str
    label: str
    group: str
    hemisphere: str
    start: int
    end: int
    x: float
    y: float


class LabAtlas:
    def __init__(self) -> None:
        self.atlas_id = DEFAULT_ATLAS_ID
        self.rois = self._build_rois()

    def _build_rois(self) -> list[AtlasRoi]:
        rois: list[AtlasRoi] = []
        per_roi = HEMISPHERE_VERTEX_COUNT // len(CURATED_ROIS)
        remainder = HEMISPHERE_VERTEX_COUNT % len(CURATED_ROIS)
        start_left = 0
        start_right = HEMISPHERE_VERTEX_COUNT

        for idx, spec in enumerate(CURATED_ROIS):
            width = per_roi + (1 if idx < remainder else 0)
            rois.append(
                AtlasRoi(
                    roi_id=f"{spec.base_id}_L",
                    base_roi=spec.base_id,
                    label=f"{spec.label} (L)",
                    group=spec.group,
                    hemisphere="left",
                    start=start_left,
                    end=start_left + width,
                    x=spec.left_position[0],
                    y=spec.left_position[1],
                )
            )
            rois.append(
                AtlasRoi(
                    roi_id=f"{spec.base_id}_R",
                    base_roi=spec.base_id,
                    label=f"{spec.label} (R)",
                    group=spec.group,
                    hemisphere="right",
                    start=start_right,
                    end=start_right + width,
                    x=spec.right_position[0],
                    y=spec.right_position[1],
                )
            )
            start_left += width
            start_right += width

        return rois

    def list_atlases(self) -> list[dict]:
        return [
            {
                "atlas_id": self.atlas_id,
                "name": "Lab curated ROI pack",
                "n_rois": len(self.rois),
                "sample_rate_hz": DEFAULT_SAMPLE_RATE_HZ,
            }
        ]

    def roi_metadata(self) -> list[dict]:
        return [asdict(roi) for roi in self.rois]

    def aggregate(self, tensor: np.ndarray) -> dict[str, np.ndarray]:
        return {roi.roi_id: tensor[:, roi.start : roi.end].mean(axis=1) for roi in self.rois}

    def frame(self, tensor: np.ndarray, time_index: int) -> list[dict]:
        return [
            {
                "roi_id": roi.roi_id,
                "base_roi": roi.base_roi,
                "label": roi.label,
                "group": roi.group,
                "hemisphere": roi.hemisphere,
                "x": roi.x,
                "y": roi.y,
                "value": float(tensor[time_index, roi.start : roi.end].mean()),
            }
            for roi in self.rois
        ]

    def top_rois(self, traces: dict[str, np.ndarray], limit: int) -> list[dict]:
        ranked = []
        for roi in self.rois:
            trace = traces[roi.roi_id]
            ranked.append(
                {
                    "roi_id": roi.roi_id,
                    "label": roi.label,
                    "hemisphere": roi.hemisphere,
                    "base_roi": roi.base_roi,
                    "score": float(np.max(trace)),
                    "mean_response": float(np.mean(trace)),
                    "peak_time_seconds": int(np.argmax(trace)),
                }
            )
        ranked.sort(key=lambda item: item["score"], reverse=True)
        return ranked[:limit]


def get_atlas() -> LabAtlas:
    return LabAtlas()

