from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from virtual_subject.api.deps import get_service
from virtual_subject.api.schemas.models import CompareRequest, RoiTraceRequest
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


@router.post("/compare")
def compare_runs(payload: CompareRequest, service: AppService = Depends(get_service)) -> dict:
    try:
        return service.compare_runs(payload.run_a_id, payload.run_b_id, payload.ablation)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

