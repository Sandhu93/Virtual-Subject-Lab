from __future__ import annotations

from fastapi import APIRouter, Depends

from virtual_subject.api.deps import get_service
from virtual_subject.services.app_service import AppService

router = APIRouter(prefix="/atlases", tags=["atlases"])


@router.get("")
def list_atlases(service: AppService = Depends(get_service)) -> list[dict]:
    return service.atlas.list_atlases()


@router.get("/{atlas_id}/rois")
def atlas_rois(atlas_id: str, service: AppService = Depends(get_service)) -> dict:
    if atlas_id != service.atlas.atlas_id:
        return {"atlas_id": atlas_id, "items": []}
    return {"atlas_id": atlas_id, "items": service.atlas.roi_metadata()}
