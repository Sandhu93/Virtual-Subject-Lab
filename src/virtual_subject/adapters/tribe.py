from __future__ import annotations

import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from virtual_subject.config import get_settings
from virtual_subject.domain.constants import (
    ABLATION_MODALITIES,
    DEFAULT_VERTEX_COUNT,
)
from virtual_subject.domain.utils import sha256_text


@dataclass
class AdapterPrediction:
    events: pd.DataFrame
    predictions: np.ndarray
    segments: list[dict[str, Any]]


class MockTribeAdapter:
    def __init__(self) -> None:
        self.settings = get_settings()

    def build_events_dataframe(self, stimulus: dict) -> pd.DataFrame:
        duration = int(max(4, round(stimulus.get("duration_seconds") or 8)))
        rows = []
        for index in range(duration):
            rows.append(
                {
                    "time_seconds": index,
                    "type": "Text" if stimulus["source_type"] == "text" else stimulus["source_type"].title(),
                    "token": f"event_{index}",
                    "stimulus_id": stimulus["id"],
                }
            )
        return pd.DataFrame(rows)

    def predict(self, stimulus: dict, ablation: str, events: pd.DataFrame) -> AdapterPrediction:
        duration = len(events.index)
        seed = int(sha256_text(f"{stimulus['checksum_sha256']}:{ablation}")[:8], 16)
        rng = np.random.default_rng(seed)
        time = np.arange(duration, dtype=np.float32)[:, None]
        vertices = np.linspace(0.0, 1.0, DEFAULT_VERTEX_COUNT, dtype=np.float32)[None, :]

        phase = (seed % 17) / 17.0
        amplitude = 0.3 + 0.2 * len(ABLATION_MODALITIES[ablation])
        slow_wave = np.sin((time / max(duration, 1)) * np.pi * (1.3 + phase))
        fast_wave = np.cos(vertices * np.pi * (2.0 + phase))
        spatial_bias = np.sin(vertices * np.pi * 5.0 + phase)

        predictions = amplitude * slow_wave * fast_wave + 0.15 * spatial_bias
        predictions += 0.03 * rng.standard_normal(size=(duration, DEFAULT_VERTEX_COUNT))
        predictions += 0.02 * np.maximum(time - 5, 0)
        predictions = predictions.astype(np.float32)

        segments = [
            {"time_index": index, "time_seconds": float(index), "ablation": ablation}
            for index in range(duration)
        ]
        return AdapterPrediction(events=events, predictions=predictions, segments=segments)


class RealTribeAdapter:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._model = None

    def _load_model(self):
        if self._model is None:
            from tribev2 import TribeModel

            self._model = TribeModel.from_pretrained(
                self.settings.tribe_model_id,
                cache_folder=str(self.settings.tribe_cache_dir),
                device=self.settings.tribe_device,
            )
        return self._model

    def build_events_dataframe(self, stimulus: dict) -> pd.DataFrame:
        model = self._load_model()
        source_type = stimulus["source_type"]
        if source_type in {"audio", "video"}:
            kwargs = {f"{source_type}_path": stimulus["local_path"]}
            return model.get_events_dataframe(**kwargs)

        if source_type == "text":
            with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as handle:
                handle.write(stimulus["text_content"])
                text_path = handle.name
            return model.get_events_dataframe(text_path=text_path)

        raise ValueError(f"Unsupported source_type {source_type!r}")

    def _apply_ablation(self, events: pd.DataFrame, ablation: str) -> pd.DataFrame:
        wanted = {name.title() for name in ABLATION_MODALITIES[ablation]}
        if ablation == "full" or "type" not in events.columns:
            return events
        filtered = events[events["type"].isin(wanted)].copy()
        return filtered if not filtered.empty else events

    def predict(self, stimulus: dict, ablation: str, events: pd.DataFrame) -> AdapterPrediction:
        model = self._load_model()
        filtered = self._apply_ablation(events, ablation)
        preds, segments = model.predict(events=filtered)
        return AdapterPrediction(events=filtered, predictions=preds.astype(np.float32), segments=segments)


def get_tribe_adapter():
    settings = get_settings()
    if settings.tribe_mode == "real":
        return RealTribeAdapter()
    return MockTribeAdapter()

