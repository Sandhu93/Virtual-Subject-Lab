from __future__ import annotations

import os
import re
import tempfile
from contextlib import contextmanager
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
        # Validate the upstream package is installed at construction time so
        # the worker fails immediately with a clear message rather than on the
        # first inference call.
        try:
            import tribev2  # noqa: F401
        except ImportError as exc:
            raise ImportError(
                "TRIBE_MODE=real requires the upstream tribev2 package, which is "
                "not installed. Follow the instructions in requirements-real.txt to "
                "install it from the source repo before switching to real mode."
            ) from exc

    def _load_model(self):
        if self._model is None:
            self._patch_event_extraction()
            from tribev2 import TribeModel

            self._model = TribeModel.from_pretrained(
                self.settings.tribe_model_id,
                cache_folder=str(self.settings.tribe_cache_dir),
                device=self.settings.tribe_device,
            )
        return self._model

    def _patch_event_extraction(self) -> None:
        if self.settings.tribe_device != "cpu":
            return

        import tribev2.eventstransforms as eventstransforms

        original = eventstransforms.ExtractWordsFromAudio._get_transcript_from_audio
        if getattr(original, "__name__", "") == "_get_transcript_from_audio_cpu_safe":
            return

        logger = eventstransforms.logger

        def _get_transcript_from_audio_cpu_safe(wav_filename: Path, language: str) -> pd.DataFrame:
            import json
            import os
            import subprocess
            import tempfile

            language_codes = {
                "english": "en",
                "french": "fr",
                "spanish": "es",
                "dutch": "nl",
                "chinese": "zh",
            }
            if language not in language_codes:
                raise ValueError(f"Language {language} not supported")

            device = "cpu"
            compute_type = "float32"

            with tempfile.TemporaryDirectory() as output_dir:
                logger.info("Running whisperx via uvx...")
                cmd = [
                    "uvx",
                    "whisperx",
                    str(wav_filename),
                    "--model",
                    "large-v3",
                    "--language",
                    language_codes[language],
                    "--device",
                    device,
                    "--compute_type",
                    compute_type,
                    "--batch_size",
                    "16",
                    "--align_model",
                    "WAV2VEC2_ASR_LARGE_LV60K_960H" if language == "english" else "",
                    "--output_dir",
                    output_dir,
                    "--output_format",
                    "json",
                ]
                cmd = [c for c in cmd if c]
                env = {k: v for k, v in os.environ.items() if k != "MPLBACKEND"}
                result = subprocess.run(cmd, capture_output=True, text=True, env=env)
                if result.returncode != 0:
                    raise RuntimeError(f"whisperx failed:\n{result.stderr}")

                json_path = Path(output_dir) / f"{wav_filename.stem}.json"
                transcript = json.loads(json_path.read_text())

            words = []
            for i, segment in enumerate(transcript["segments"]):
                sentence = segment["text"].replace('"', "")
                for word in segment["words"]:
                    if "start" not in word:
                        continue
                    words.append(
                        {
                            "text": word["word"].replace('"', ""),
                            "start": word["start"],
                            "duration": word["end"] - word["start"],
                            "sequence_id": i,
                            "sentence": sentence,
                        }
                    )

            return pd.DataFrame(words)

        eventstransforms.ExtractWordsFromAudio._get_transcript_from_audio = staticmethod(
            _get_transcript_from_audio_cpu_safe
        )

    @contextmanager
    def _event_extraction_env(self):
        if self.settings.tribe_device != "cpu":
            yield
            return

        import torch

        previous = os.environ.get("CUDA_VISIBLE_DEVICES")
        previous_is_available = torch.cuda.is_available
        os.environ["CUDA_VISIBLE_DEVICES"] = ""
        torch.cuda.is_available = lambda: False
        try:
            yield
        finally:
            torch.cuda.is_available = previous_is_available
            if previous is None:
                os.environ.pop("CUDA_VISIBLE_DEVICES", None)
            else:
                os.environ["CUDA_VISIBLE_DEVICES"] = previous

    @staticmethod
    def _detect_tts_language(text: str) -> str:
        from gtts.lang import tts_langs
        from langdetect import detect

        supported = set(tts_langs())
        try:
            detected = detect(text)
        except Exception:
            return "en"
        return detected if detected in supported else "en"

    @staticmethod
    def _build_text_transcript(text: str) -> pd.DataFrame:
        sentence_text = text.strip()
        sentences = [
            chunk.strip()
            for chunk in re.split(r"(?<=[.!?])\s+", sentence_text)
            if chunk.strip()
        ] or [sentence_text]

        rows: list[dict[str, Any]] = []
        cursor = 0.0
        for sequence_id, sentence in enumerate(sentences):
            words = re.findall(r"[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*", sentence)
            if not words:
                continue
            for word in words:
                duration = min(0.65, max(0.18, 0.045 * len(word)))
                rows.append(
                    {
                        "text": word,
                        "start": round(cursor, 3),
                        "duration": round(duration, 3),
                        "sequence_id": sequence_id,
                        "sentence": sentence.replace('"', ""),
                    }
                )
                cursor += duration + 0.035
            cursor += 0.12

        if not rows:
            raise ValueError("Text stimulus produced no word tokens")
        return pd.DataFrame(rows)

    @classmethod
    def _write_text_transcript_sidecar(cls, audio_path: Path, text: str) -> Path:
        transcript_path = audio_path.with_suffix(".tsv")
        cls._build_text_transcript(text).to_csv(transcript_path, sep="\t", index=False)
        return transcript_path

    def build_events_dataframe(self, stimulus: dict) -> pd.DataFrame:
        model = self._load_model()
        source_type = stimulus["source_type"]
        if source_type in {"audio", "video"}:
            kwargs = {f"{source_type}_path": stimulus["local_path"]}
            with self._event_extraction_env():
                return model.get_events_dataframe(**kwargs)

        if source_type == "text":
            from gtts import gTTS

            text = (stimulus.get("text_content") or "").strip()
            if not text:
                raise ValueError("Text stimulus is empty")

            language = self._detect_tts_language(text)
            with tempfile.NamedTemporaryFile("wb", suffix=".mp3", delete=False) as handle:
                audio_path = Path(handle.name)
            gTTS(text, lang=language).save(str(audio_path))
            # TRIBE skips WhisperX when a sibling .tsv transcript already exists.
            # For text-only inputs, we can generate those timings deterministically.
            self._write_text_transcript_sidecar(audio_path, text)
            with self._event_extraction_env():
                return model.get_events_dataframe(audio_path=str(audio_path))

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
