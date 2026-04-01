from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from virtual_subject.api.deps import get_service
from virtual_subject.api.schemas.models import RunCreateRequest
from virtual_subject.services.app_service import AppService

router = APIRouter(prefix="/runs", tags=["runs"])


def _serialize_run(run, ablations: list | None = None) -> dict:
    payload = {
        "run_id": run.id,
        "stimulus_id": run.stimulus_id,
        "status": run.status,
        "atlas_id": run.atlas_id,
        "normalization": run.normalization,
        "subject_mode": run.subject_mode,
        "prediction_target": run.prediction_target,
        "requested_ablations": run.requested_ablations,
        "input_hash": run.input_hash,
        "metadata": run.metadata_json,
        "created_at": run.created_at.isoformat(),
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "error_message": run.error_message,
    }
    if ablations is not None:
        payload["ablations"] = [
            {
                "ablation": item.ablation,
                "status": item.status,
                "sample_rate_hz": item.sample_rate_hz,
                "n_timesteps": item.n_timesteps,
                "n_vertices": item.n_vertices,
                "preview_key": item.preview_key,
            }
            for item in ablations
        ]
    return payload


@router.get("")
def list_runs(service: AppService = Depends(get_service)) -> list[dict]:
    return [_serialize_run(run) for run in service.list_runs()]


@router.post("")
def create_run(payload: RunCreateRequest, service: AppService = Depends(get_service)) -> dict:
    try:
        run, cached = service.create_run(
            stimulus_id=payload.stimulus_id,
            ablations=payload.ablations,
            atlas_id=payload.atlas_id,
            normalization=payload.normalization,
        )
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"cached": cached, **_serialize_run(run, service.get_run_ablations(run.id))}


@router.get("/{run_id}")
def get_run(run_id: str, service: AppService = Depends(get_service)) -> dict:
    try:
        run = service.get_run(run_id)
        return _serialize_run(run, service.get_run_ablations(run.id))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{run_id}/artifacts")
def list_artifacts(run_id: str, service: AppService = Depends(get_service)) -> dict:
    return {"run_id": run_id, "items": service.list_artifacts(run_id)}


@router.get("/{run_id}/timeline")
def get_timeline(run_id: str, ablation: str = "full", service: AppService = Depends(get_service)) -> dict:
    try:
        return service.get_timeline(run_id, ablation)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{run_id}/events")
def get_run_events(run_id: str, ablation: str = "full", service: AppService = Depends(get_service)) -> dict:
    try:
        return service.get_run_events(run_id, ablation)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{run_id}/frames/{time_index}")
def get_frame(
    run_id: str,
    time_index: int,
    ablation: str = "full",
    service: AppService = Depends(get_service),
) -> dict:
    try:
        return service.get_frame(run_id, ablation, time_index)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{run_id}/frames/{time_index}/vertices")
def get_frame_vertices(
    run_id: str,
    time_index: int,
    ablation: str = "full",
    service: AppService = Depends(get_service),
):
    """Return per-vertex float32 values at a single timepoint as binary octet-stream.

    The response body is a raw little-endian float32 array of length n_vertices
    (20 484 for fsaverage5 cortex). Clients should read it with:
        new Float32Array(await response.arrayBuffer())
    """
    import struct
    from fastapi.responses import Response

    try:
        vertices = service.get_frame_vertices(run_id, ablation, time_index)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    data = struct.pack(f"<{len(vertices)}f", *vertices.tolist())
    return Response(
        content=data,
        media_type="application/octet-stream",
        headers={
            "X-Vertex-Count": str(len(vertices)),
            "X-Time-Index": str(time_index),
            "X-Ablation": ablation,
        },
    )
