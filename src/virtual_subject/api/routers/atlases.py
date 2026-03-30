from __future__ import annotations

from fastapi import APIRouter, Depends

from virtual_subject.api.deps import get_service
from virtual_subject.services.app_service import AppService

router = APIRouter(prefix="/atlases", tags=["atlases"])


@router.get("")
def list_atlases(service: AppService = Depends(get_service)) -> list[dict]:
    return service.atlas.list_atlases()

