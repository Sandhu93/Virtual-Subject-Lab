from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from virtual_subject.api.deps import get_service
from virtual_subject.api.schemas.models import ContrastRequest, RoiTraceRequest
from virtual_subject.services.app_service import AppService

router = APIRouter(prefix="/analysis", tags=["analysis"])


@router.post("/roi-traces")
def get_roi_traces(payload: RoiTraceRequest, service: AppService = Depends(get_service)) -> dict:
    try:
        return service.get_roi_traces(payload.run_id, payload.ablation, payload.roi_ids)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/top-rois")
def top_rois(
    run_id: str,
    ablation: str = "full",
    limit: int = 10,
    service: AppService = Depends(get_service),
) -> dict:
    try:
        return service.get_top_rois(run_id, ablation, limit)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/contrast")
def create_contrast(payload: ContrastRequest, service: AppService = Depends(get_service)) -> dict:
    """Compute a vertex-level contrast between two runs and store it.

    Returns a contrast_id and the URL of the stored contrast .npy array.
    The array shape is (n_vertices,) containing run_a − run_b mean-across-time
    differences (or the mode selected in the request).
    """
    try:
        return service.create_contrast(
            payload.run_a_id, payload.run_b_id, payload.ablation, payload.mode
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/contrast/{contrast_id}")
def get_contrast(contrast_id: str, service: AppService = Depends(get_service)) -> dict:
    """Retrieve metadata and download URL for a previously computed contrast."""
    try:
        return service.get_contrast(contrast_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/contrast/{contrast_id}/download")
def download_contrast(contrast_id: str, service: AppService = Depends(get_service)):
    """Stream the contrast .npy array as application/octet-stream."""
    from fastapi.responses import Response

    try:
        row = service.get_contrast(contrast_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    from virtual_subject.db.models import Contrast

    record = service.db.get(Contrast, contrast_id)
    if record is None or not record.contrast_key:
        raise HTTPException(status_code=404, detail="Contrast array not found")
    data = service.storage.get_bytes(record.contrast_key)
    return Response(content=data, media_type="application/octet-stream")
