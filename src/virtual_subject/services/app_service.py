from __future__ import annotations

import io
import mimetypes
import tempfile
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from virtual_subject.adapters.atlas import LabAtlas, get_atlas
from virtual_subject.adapters.storage import StorageAdapter, get_storage
from virtual_subject.adapters.tribe import get_tribe_adapter
from virtual_subject.config import get_settings
from virtual_subject.db.bootstrap import ensure_defaults
from virtual_subject.db.models import (
    Artifact,
    AuditLog,
    Export,
    Job,
    RoiSummary,
    Run,
    RunAblation,
    Stimulus,
    StimulusMetadata,
    WorkerHeartbeat,
)
from virtual_subject.domain.constants import (
    ABLATION_MODALITIES,
    DEFAULT_ATLAS_ID,
    DEFAULT_BUCKET_PREFIX,
    DEFAULT_NORMALIZATION,
    DEFAULT_PREDICTION_TARGET,
    DEFAULT_SUBJECT_MODE,
    SOURCE_MODALITIES,
    SUPPORTED_ABLATIONS,
)
from virtual_subject.domain.utils import new_id, sha256_bytes, sha256_text, stable_hash, utcnow


class AppService:
    def __init__(self, db: Session, storage: StorageAdapter | None = None, atlas: LabAtlas | None = None) -> None:
        self.db = db
        self.storage = storage or get_storage()
        self.atlas = atlas or get_atlas()
        self.settings = get_settings()
        self.user, self.project = ensure_defaults(db)

    def _artifact_key(self, *parts: str) -> str:
        return "/".join([DEFAULT_BUCKET_PREFIX, self.project.id, *parts])

    def _log(self, action: str, target_type: str, target_id: str, payload: dict | None = None) -> None:
        self.db.add(
            AuditLog(
                action=action,
                target_type=target_type,
                target_id=target_id,
                user_id=self.user.id,
                payload_json=payload or {},
            )
        )

    def _upsert_stimulus_metadata(self, stimulus_id: str) -> StimulusMetadata:
        metadata = self.db.get(StimulusMetadata, stimulus_id)
        if metadata is None:
            metadata = StimulusMetadata(stimulus_id=stimulus_id)
            self.db.add(metadata)
            self.db.flush()
        return metadata

    def list_stimuli(self) -> list[Stimulus]:
        return list(self.db.scalars(select(Stimulus).order_by(Stimulus.created_at.desc())))

    def get_stimulus(self, stimulus_id: str) -> Stimulus:
        stimulus = self.db.get(Stimulus, stimulus_id)
        if stimulus is None:
            raise KeyError(f"Unknown stimulus {stimulus_id}")
        return stimulus

    def create_upload_stimulus(self, name: str, source_type: str, mime_type: str | None, filename: str | None) -> Stimulus:
        if source_type not in SOURCE_MODALITIES:
            raise ValueError("source_type must be one of text, audio, video")

        stimulus = Stimulus(
            id=new_id("stim"),
            project_id=self.project.id,
            name=name,
            source_type=source_type,
            status="pending_upload",
            mime_type=mime_type or mimetypes.guess_type(filename or "")[0],
            original_filename=filename,
            modalities=sorted(SOURCE_MODALITIES[source_type]),
        )
        self.db.add(stimulus)
        self.db.flush()
        self._upsert_stimulus_metadata(stimulus.id)
        self._log("stimulus.created", "stimulus", stimulus.id, {"source_type": source_type})
        self.db.commit()
        return stimulus

    def upload_stimulus_content(self, stimulus_id: str, filename: str, content: bytes) -> Stimulus:
        stimulus = self.get_stimulus(stimulus_id)
        extension = Path(filename).suffix.lower() or {
            "audio": ".bin",
            "video": ".bin",
            "text": ".txt",
        }[stimulus.source_type]
        key = self._artifact_key("stimuli", stimulus.id, f"source{extension}")
        self.storage.put_bytes(key, content, stimulus.mime_type or "application/octet-stream")
        stimulus.storage_key = key
        stimulus.original_filename = filename
        stimulus.uploaded_at = utcnow()
        self.db.add(stimulus)
        self.db.commit()
        return stimulus

    def finalize_stimulus(self, stimulus_id: str) -> Stimulus:
        stimulus = self.get_stimulus(stimulus_id)
        if stimulus.source_type == "text":
            payload = stimulus.text_content or ""
            stimulus.checksum_sha256 = sha256_text(payload)
            stimulus.duration_seconds = max(4.0, float(len(payload.split()) * 0.55))
        else:
            if not stimulus.storage_key:
                raise ValueError("Stimulus file has not been uploaded yet")
            raw = self.storage.get_bytes(stimulus.storage_key)
            stimulus.checksum_sha256 = sha256_bytes(raw)
            stimulus.duration_seconds = max(4.0, min(90.0, len(raw) / 50000.0))

        stimulus.status = "ready"
        self.db.add(stimulus)
        self._log("stimulus.finalized", "stimulus", stimulus.id, {"modalities": stimulus.modalities})
        self.db.commit()
        return stimulus

    def create_text_stimulus(self, name: str, text: str) -> Stimulus:
        if not text.strip():
            raise ValueError("text cannot be empty")

        stimulus = Stimulus(
            id=new_id("stim"),
            project_id=self.project.id,
            name=name,
            source_type="text",
            status="ready",
            mime_type="text/plain",
            original_filename=None,
            text_content=text.strip(),
            duration_seconds=max(4.0, float(len(text.split()) * 0.55)),
            checksum_sha256=sha256_text(text.strip()),
            modalities=sorted(SOURCE_MODALITIES["text"]),
        )
        self.db.add(stimulus)
        self.db.add(StimulusMetadata(stimulus_id=stimulus.id, transcript_text=text.strip()))
        self._log("stimulus.created", "stimulus", stimulus.id, {"source_type": "text"})
        self.db.commit()
        return stimulus

    def _resolve_ablations(self, stimulus: Stimulus, requested: list[str] | None) -> list[str]:
        requested = requested or ["full"]
        available = set(stimulus.modalities)
        resolved = []
        for ablation in requested:
            if ablation not in SUPPORTED_ABLATIONS:
                raise ValueError(f"Unsupported ablation {ablation!r}")
            if ablation == "full":
                resolved.append(ablation)
                continue
            if ABLATION_MODALITIES[ablation].issubset(available):
                resolved.append(ablation)
        return list(dict.fromkeys(resolved or ["full"]))

    def _run_cache_key(self, stimulus: Stimulus, ablations: list[str], atlas_id: str, normalization: str) -> str:
        payload = {
            "input_hash": stimulus.checksum_sha256,
            "ablations": sorted(ablations),
            "atlas_id": atlas_id,
            "normalization": normalization,
            "subject_mode": DEFAULT_SUBJECT_MODE,
            "prediction_target": DEFAULT_PREDICTION_TARGET,
        }
        return stable_hash(payload)

    def create_run(
        self,
        stimulus_id: str,
        ablations: list[str] | None = None,
        atlas_id: str = DEFAULT_ATLAS_ID,
        normalization: str = DEFAULT_NORMALIZATION,
    ) -> tuple[Run, bool]:
        stimulus = self.get_stimulus(stimulus_id)
        if stimulus.status != "ready":
            raise ValueError("Stimulus must be ready before a run is created")

        resolved_ablations = self._resolve_ablations(stimulus, ablations)
        cache_key = self._run_cache_key(stimulus, resolved_ablations, atlas_id, normalization)
        cached = self.db.scalar(
            select(Run).where(Run.cache_key == cache_key, Run.status == "succeeded").order_by(Run.created_at.desc())
        )
        if cached is not None:
            return cached, True

        run = Run(
            id=new_id("run"),
            project_id=self.project.id,
            stimulus_id=stimulus.id,
            status="queued",
            cache_key=cache_key,
            subject_mode=DEFAULT_SUBJECT_MODE,
            prediction_target=DEFAULT_PREDICTION_TARGET,
            atlas_id=atlas_id,
            normalization=normalization,
            created_by=self.user.id,
            input_hash=stimulus.checksum_sha256 or "",
            requested_ablations=resolved_ablations,
            metadata_json={
                "model_id": self.settings.tribe_model_id,
                "app_git_commit": self.settings.app_git_commit,
                "tribe_upstream_version": self.settings.tribe_upstream_version,
                "weights_source": self.settings.tribe_weights_source,
                "source_type": stimulus.source_type,
            },
        )
        self.db.add(run)
        self.db.flush()

        for ablation in resolved_ablations:
            self.db.add(
                RunAblation(
                    id=new_id("abl"),
                    run_id=run.id,
                    ablation=ablation,
                    status="queued",
                )
            )

        self.db.add(
            Job(
                id=new_id("job"),
                kind="run_prediction",
                owner_id=run.id,
                status="queued",
                payload_json={"run_id": run.id},
            )
        )
        self._log("run.created", "run", run.id, {"ablations": resolved_ablations})
        self.db.commit()
        return run, False

    def list_runs(self) -> list[Run]:
        return list(self.db.scalars(select(Run).order_by(Run.created_at.desc())))

    def get_run(self, run_id: str) -> Run:
        run = self.db.get(Run, run_id)
        if run is None:
            raise KeyError(f"Unknown run {run_id}")
        return run

    def get_run_ablations(self, run_id: str) -> list[RunAblation]:
        query = select(RunAblation).where(RunAblation.run_id == run_id).order_by(RunAblation.ablation)
        return list(self.db.scalars(query))

    def claim_next_job(self) -> Job | None:
        job = self.db.scalar(select(Job).where(Job.status == "queued").order_by(Job.created_at.asc()).limit(1))
        if job is None:
            return None
        job.status = "running"
        job.claimed_at = utcnow()
        job.attempts += 1
        self.db.add(job)
        self.db.commit()
        return job

    def update_worker_heartbeat(self, worker_name: str, status: str, detail: dict | None = None) -> None:
        row = self.db.get(WorkerHeartbeat, worker_name)
        if row is None:
            row = WorkerHeartbeat(worker_name=worker_name, status=status, mode=self.settings.tribe_mode)
        row.status = status
        row.mode = self.settings.tribe_mode
        row.detail_json = detail or {}
        row.last_seen_at = utcnow()
        self.db.add(row)
        self.db.commit()

    def _stimulus_payload(self, stimulus: Stimulus) -> dict:
        payload = {
            "id": stimulus.id,
            "source_type": stimulus.source_type,
            "checksum_sha256": stimulus.checksum_sha256,
            "duration_seconds": stimulus.duration_seconds,
            "text_content": stimulus.text_content,
        }
        if stimulus.storage_key:
            if self.settings.storage_backend == "filesystem":
                payload["local_path"] = str(Path("storage") / stimulus.storage_key)
            else:
                suffix = Path(stimulus.original_filename or "stimulus.bin").suffix or ".bin"
                with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as handle:
                    handle.write(self.storage.get_bytes(stimulus.storage_key))
                    payload["local_path"] = handle.name
        return payload

    def _record_artifact(
        self,
        owner_type: str,
        owner_id: str,
        artifact_type: str,
        key: str,
        payload: bytes | None = None,
        metadata: dict | None = None,
    ) -> None:
        if payload is not None:
            size = len(payload)
            checksum = sha256_bytes(payload)
        else:
            stat = self.storage.stat(key)
            size = int(stat.get("size", 0))
            checksum = str(stat.get("etag", ""))
        self.db.add(
            Artifact(
                id=new_id("art"),
                owner_type=owner_type,
                owner_id=owner_id,
                artifact_type=artifact_type,
                storage_key=key,
                checksum_sha256=checksum,
                size_bytes=size,
                metadata_json=metadata or {},
            )
        )

    def _build_preview_png(self, frame: list[dict], title: str) -> bytes:
        image = Image.new("RGB", (720, 420), color=(248, 244, 236))
        draw = ImageDraw.Draw(image)
        draw.ellipse((40, 50, 320, 360), outline=(70, 88, 73), width=2)
        draw.ellipse((400, 50, 680, 360), outline=(70, 88, 73), width=2)
        draw.text((40, 18), title, fill=(31, 38, 32))

        for roi in frame:
            base_color = 180 + int(max(-1.0, min(1.0, roi["value"])) * 50)
            color = (max(100, base_color), 110, 90)
            radius = 18
            if roi["hemisphere"] == "left":
                cx = int(40 + roi["x"] * 280)
            else:
                cx = int(400 + (roi["x"] - 0.5) * 280)
            cy = int(40 + (1.0 - roi["y"]) * 300)
            draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=color)

        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        return buffer.getvalue()

    def process_run_job(self, run_id: str) -> None:
        run = self.get_run(run_id)
        stimulus = self.get_stimulus(run.stimulus_id)
        run.status = "running"
        run.started_at = utcnow()
        self.db.add(run)
        self.db.commit()

        adapter = get_tribe_adapter()
        stimulus_payload = self._stimulus_payload(stimulus)
        events = adapter.build_events_dataframe(stimulus_payload)
        events_key = self._artifact_key("stimuli", stimulus.id, "events.json")
        self.storage.put_json(events_key, events.fillna("").to_dict(orient="records"))
        metadata = self._upsert_stimulus_metadata(stimulus.id)
        metadata.events_key = events_key
        self.db.add(metadata)
        self.db.commit()

        ablations = self.get_run_ablations(run.id)
        for run_ablation in ablations:
            result = adapter.predict(stimulus_payload, run_ablation.ablation, events)
            tensor_key = self._artifact_key("runs", run.id, run_ablation.ablation, "prediction.npy")
            self.storage.put_numpy(tensor_key, result.predictions)
            self._record_artifact("run", run.id, "prediction_npy", tensor_key)

            traces = self.atlas.aggregate(result.predictions)
            traces_payload = {
                "sample_rate_hz": 1.0,
                "n_timesteps": int(result.predictions.shape[0]),
                "traces": {name: trace.tolist() for name, trace in traces.items()},
                "roi_metadata": self.atlas.roi_metadata(),
            }
            traces_key = self._artifact_key("runs", run.id, run_ablation.ablation, "roi_traces.json")
            self.storage.put_json(traces_key, traces_payload)
            self._record_artifact("run", run.id, "roi_traces_json", traces_key)

            preview_index = int(np.argmax(result.predictions.mean(axis=1)))
            preview_frame = self.atlas.frame(result.predictions, preview_index)
            preview_bytes = self._build_preview_png(preview_frame, f"{run_ablation.ablation} preview")
            preview_key = self._artifact_key("runs", run.id, run_ablation.ablation, "preview.png")
            self.storage.put_bytes(preview_key, preview_bytes, "image/png")
            self._record_artifact("run", run.id, "preview_png", preview_key, preview_bytes)

            self.db.execute(delete(RoiSummary).where(RoiSummary.run_ablation_id == run_ablation.id))
            top_rows = self.atlas.top_rois(traces, limit=len(self.atlas.rois))
            laterality = {}
            for row in top_rows:
                if row["roi_id"].endswith("_L"):
                    pair = row["roi_id"].replace("_L", "")
                    left_mean = row["mean_response"]
                    right_trace = traces.get(f"{pair}_R")
                    right_mean = float(np.mean(right_trace)) if right_trace is not None else 0.0
                    laterality[pair] = (left_mean - right_mean) / (abs(left_mean) + abs(right_mean) + 1e-6)

            label_lookup = {roi.roi_id: roi for roi in self.atlas.rois}
            for rank, row in enumerate(top_rows, start=1):
                spec = label_lookup[row["roi_id"]]
                self.db.add(
                    RoiSummary(
                        run_ablation_id=run_ablation.id,
                        roi_id=row["roi_id"],
                        roi_label=row["label"],
                        base_roi=spec.base_roi,
                        hemisphere=spec.hemisphere,
                        mean_response=row["mean_response"],
                        peak_response=row["score"],
                        peak_time_seconds=float(row["peak_time_seconds"]),
                        auc=float(np.trapezoid(traces[row["roi_id"]])),
                        laterality_index=laterality.get(spec.base_roi),
                        rank_global=rank,
                    )
                )

            run_ablation.status = "succeeded"
            run_ablation.tensor_key = tensor_key
            run_ablation.roi_traces_key = traces_key
            run_ablation.preview_key = preview_key
            run_ablation.sample_rate_hz = 1.0
            run_ablation.n_timesteps = int(result.predictions.shape[0])
            run_ablation.n_vertices = int(result.predictions.shape[1])
            run_ablation.finished_at = utcnow()
            self.db.add(run_ablation)

        run.status = "succeeded"
        run.finished_at = utcnow()
        self.db.add(run)
        self._log("run.completed", "run", run.id, {"ablations": [item.ablation for item in ablations]})
        self.db.commit()

    def fail_job(self, job: Job, message: str) -> None:
        job.status = "failed"
        job.finished_at = utcnow()
        job.error_message = message
        self.db.add(job)
        run = self.db.get(Run, job.owner_id)
        if run is not None:
            run.status = "failed"
            run.error_message = message
            run.finished_at = utcnow()
            self.db.add(run)
        export = self.db.get(Export, job.owner_id)
        if export is not None:
            export.status = "failed"
            export.error_message = message
            export.finished_at = utcnow()
            self.db.add(export)
        self.db.commit()

    def complete_job(self, job: Job) -> None:
        job.status = "succeeded"
        job.progress = 1.0
        job.finished_at = utcnow()
        self.db.add(job)
        self.db.commit()

    def get_timeline(self, run_id: str, ablation: str) -> dict:
        record = self.db.scalar(
            select(RunAblation).where(RunAblation.run_id == run_id, RunAblation.ablation == ablation)
        )
        if record is None or not record.tensor_key:
            raise KeyError("No prediction tensor for the requested ablation")
        tensor = self.storage.get_numpy(record.tensor_key)
        return {
            "run_id": run_id,
            "ablation": ablation,
            "n_timesteps": int(tensor.shape[0]),
            "sample_rate_hz": 1.0,
            "global_signal": tensor.mean(axis=1).astype(float).tolist(),
        }

    def get_frame(self, run_id: str, ablation: str, time_index: int) -> dict:
        record = self.db.scalar(
            select(RunAblation).where(RunAblation.run_id == run_id, RunAblation.ablation == ablation)
        )
        if record is None or not record.tensor_key:
            raise KeyError("No prediction tensor for the requested ablation")
        tensor = self.storage.get_numpy(record.tensor_key)
        time_index = max(0, min(time_index, tensor.shape[0] - 1))
        frame = self.atlas.frame(tensor, time_index)
        return {
            "run_id": run_id,
            "ablation": ablation,
            "time_index": time_index,
            "time_seconds": float(time_index),
            "global_mean": float(tensor[time_index].mean()),
            "global_max": float(tensor[time_index].max()),
            "roi_frame": frame,
        }

    def get_roi_traces(self, run_id: str, ablation: str, roi_ids: list[str]) -> dict:
        record = self.db.scalar(
            select(RunAblation).where(RunAblation.run_id == run_id, RunAblation.ablation == ablation)
        )
        if record is None or not record.roi_traces_key:
            raise KeyError("ROI traces are not available yet")
        payload = self.storage.get_json(record.roi_traces_key)
        traces = payload["traces"]
        summaries = {
            row.roi_id: row
            for row in self.db.scalars(select(RoiSummary).where(RoiSummary.run_ablation_id == record.id))
        }
        return {
            "run_id": run_id,
            "ablation": ablation,
            "sample_rate_hz": payload["sample_rate_hz"],
            "traces": [
                {
                    "roi_id": roi_id,
                    "mean_trace": traces[roi_id],
                    "peak_value": summaries[roi_id].peak_response,
                    "peak_time_seconds": summaries[roi_id].peak_time_seconds,
                }
                for roi_id in roi_ids
                if roi_id in traces
            ],
        }

    def get_top_rois(self, run_id: str, ablation: str, limit: int) -> dict:
        record = self.db.scalar(
            select(RunAblation).where(RunAblation.run_id == run_id, RunAblation.ablation == ablation)
        )
        if record is None:
            raise KeyError("No such ablation")
        items = list(
            self.db.scalars(
                select(RoiSummary)
                .where(RoiSummary.run_ablation_id == record.id)
                .order_by(RoiSummary.rank_global.asc())
                .limit(limit)
            )
        )
        return {
            "run_id": run_id,
            "ablation": ablation,
            "items": [
                {
                    "roi_id": item.roi_id,
                    "label": item.roi_label,
                    "mean_response": item.mean_response,
                    "peak_response": item.peak_response,
                    "peak_time_seconds": item.peak_time_seconds,
                    "laterality_index": item.laterality_index,
                }
                for item in items
            ],
        }

    def compare_runs(self, run_a_id: str, run_b_id: str, ablation: str) -> dict:
        timeline_a = self.get_timeline(run_a_id, ablation)
        timeline_b = self.get_timeline(run_b_id, ablation)
        top_a = self.get_top_rois(run_a_id, ablation, 10)["items"]
        top_b = self.get_top_rois(run_b_id, ablation, 10)["items"]
        lookup_b = {item["roi_id"]: item for item in top_b}
        roi_deltas = []
        for item in top_a:
            other = lookup_b.get(item["roi_id"])
            roi_deltas.append(
                {
                    "roi_id": item["roi_id"],
                    "label": item["label"],
                    "run_a_peak": item["peak_response"],
                    "run_b_peak": other["peak_response"] if other else 0.0,
                    "delta_peak": item["peak_response"] - (other["peak_response"] if other else 0.0),
                }
            )
        roi_deltas.sort(key=lambda row: abs(row["delta_peak"]), reverse=True)
        return {
            "run_a_id": run_a_id,
            "run_b_id": run_b_id,
            "ablation": ablation,
            "global_mean_delta": float(np.mean(timeline_a["global_signal"]) - np.mean(timeline_b["global_signal"])),
            "roi_deltas": roi_deltas,
        }

    def list_artifacts(self, run_id: str) -> list[dict]:
        query = select(Artifact).where(Artifact.owner_type == "run", Artifact.owner_id == run_id).order_by(Artifact.created_at.asc())
        rows = list(self.db.scalars(query))
        return [
            {
                "artifact_id": row.id,
                "artifact_type": row.artifact_type,
                "storage_key": row.storage_key,
                "size_bytes": row.size_bytes,
            }
            for row in rows
        ]

    def create_export(self, run_id: str) -> Export:
        export = Export(id=new_id("exp"), run_id=run_id, status="queued")
        self.db.add(export)
        self.db.flush()
        self.db.add(
            Job(
                id=new_id("job"),
                kind="export_bundle",
                owner_id=export.id,
                status="queued",
                payload_json={"export_id": export.id},
            )
        )
        self._log("export.created", "export", export.id, {"run_id": run_id})
        self.db.commit()
        return export

    def list_exports(self) -> list[Export]:
        return list(self.db.scalars(select(Export).order_by(Export.created_at.desc())))

    def process_export_job(self, export_id: str) -> None:
        export = self.db.get(Export, export_id)
        if export is None:
            raise KeyError(export_id)
        run = self.get_run(export.run_id)
        run_ablations = self.get_run_ablations(run.id)

        manifest = {
            "export_id": export.id,
            "run_id": run.id,
            "model_id": run.metadata_json.get("model_id"),
            "app_git_commit": run.metadata_json.get("app_git_commit"),
            "tribe_upstream_version": run.metadata_json.get("tribe_upstream_version"),
            "weights_source": run.metadata_json.get("weights_source"),
            "atlas_id": run.atlas_id,
            "normalization": run.normalization,
            "subject_mode": run.subject_mode,
            "created_at": export.created_at.isoformat(),
            "run_metadata": run.metadata_json,
        }

        manifest_key = self._artifact_key("exports", export.id, "manifest.json")
        self.storage.put_json(manifest_key, manifest)

        bundle_buffer = io.BytesIO()
        with zipfile.ZipFile(bundle_buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("manifest.json", self.storage.get_text(manifest_key))
            for ablation in run_ablations:
                if ablation.tensor_key:
                    archive.writestr(
                        f"{ablation.ablation}/prediction.npy",
                        self.storage.get_bytes(ablation.tensor_key),
                    )
                if ablation.roi_traces_key:
                    archive.writestr(
                        f"{ablation.ablation}/roi_traces.json",
                        self.storage.get_text(ablation.roi_traces_key),
                    )
                if ablation.preview_key:
                    archive.writestr(
                        f"{ablation.ablation}/preview.png",
                        self.storage.get_bytes(ablation.preview_key),
                    )

        bundle_key = self._artifact_key("exports", export.id, "bundle.zip")
        self.storage.put_bytes(bundle_key, bundle_buffer.getvalue(), "application/zip")
        self._record_artifact("export", export.id, "export_zip", bundle_key, bundle_buffer.getvalue())
        self._record_artifact("export", export.id, "manifest_json", manifest_key)

        export.status = "succeeded"
        export.bundle_key = bundle_key
        export.manifest_key = manifest_key
        export.finished_at = utcnow()
        self.db.add(export)
        self.db.commit()

    def get_export(self, export_id: str) -> Export:
        export = self.db.get(Export, export_id)
        if export is None:
            raise KeyError(export_id)
        return export
