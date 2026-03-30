from __future__ import annotations

from dataclasses import dataclass

SUPPORTED_ABLATIONS = (
    "full",
    "text_only",
    "audio_only",
    "video_only",
    "text_audio",
    "text_video",
    "audio_video",
)

ABLATION_MODALITIES: dict[str, set[str]] = {
    "full": {"text", "audio", "video"},
    "text_only": {"text"},
    "audio_only": {"audio"},
    "video_only": {"video"},
    "text_audio": {"text", "audio"},
    "text_video": {"text", "video"},
    "audio_video": {"audio", "video"},
}

SOURCE_MODALITIES: dict[str, set[str]] = {
    "text": {"text", "audio"},
    "audio": {"audio", "text"},
    "video": {"video", "audio", "text"},
}

DEFAULT_ATLAS_ID = "lab_curated_v1"
DEFAULT_PREDICTION_TARGET = "cortical"
DEFAULT_NORMALIZATION = "segment_p99"
DEFAULT_SUBJECT_MODE = "average"
DEFAULT_BUCKET_PREFIX = "projects"
DEFAULT_SAMPLE_RATE_HZ = 1.0
DEFAULT_VERTEX_COUNT = 20484
HEMISPHERE_VERTEX_COUNT = DEFAULT_VERTEX_COUNT // 2


@dataclass(frozen=True)
class RoiSpec:
    base_id: str
    label: str
    group: str
    left_position: tuple[float, float]
    right_position: tuple[float, float]


CURATED_ROIS: tuple[RoiSpec, ...] = (
    RoiSpec("early_visual", "Early visual", "Visual", (0.18, 0.78), (0.82, 0.78)),
    RoiSpec("ventral_visual", "Ventral visual", "Visual", (0.27, 0.66), (0.73, 0.66)),
    RoiSpec("dorsal_visual", "Dorsal visual", "Visual", (0.24, 0.52), (0.76, 0.52)),
    RoiSpec("mt_motion", "MT / motion", "Visual", (0.34, 0.47), (0.66, 0.47)),
    RoiSpec("early_auditory", "Early auditory", "Auditory", (0.22, 0.34), (0.78, 0.34)),
    RoiSpec(
        "auditory_association",
        "Auditory association",
        "Auditory",
        (0.31, 0.28),
        (0.69, 0.28),
    ),
    RoiSpec("sts_language", "STS / language", "Language", (0.39, 0.28), (0.61, 0.28)),
    RoiSpec(
        "inferior_frontal",
        "Inferior frontal / Broca-related",
        "Language",
        (0.43, 0.42),
        (0.57, 0.42),
    ),
    RoiSpec("tpj_multisensory", "TPJ / multisensory", "Multisensory", (0.38, 0.58), (0.62, 0.58)),
    RoiSpec("default_mode", "Default mode", "Association", (0.45, 0.62), (0.55, 0.62)),
    RoiSpec("ffa", "FFA", "Localizer", (0.30, 0.61), (0.70, 0.61)),
    RoiSpec("ppa", "PPA", "Localizer", (0.34, 0.72), (0.66, 0.72)),
    RoiSpec("eba", "EBA", "Localizer", (0.36, 0.53), (0.64, 0.53)),
    RoiSpec("vwfa", "VWFA", "Localizer", (0.41, 0.59), (0.59, 0.59)),
)

