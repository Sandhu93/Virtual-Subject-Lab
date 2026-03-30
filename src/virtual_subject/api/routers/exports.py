from __future__ import annotations

import mimetypes

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from virtual_subject.api.deps import get_service
from virtual_subject.api.schemas.models import ExportCreateRequest
from virtual_subject.services.app_service import AppService

router = APIRouter(prefix="/exports", tags=["exports"])


@router.get("")
def list_exports(service: AppService = Depends(get_service)) -> list[dict]:
    return [
        {
            "export_id": export.id,
            "run_id": export.run_id,
            "status": export.status,
            "bundle_key": export.bundle_key,
            "created_at": export.created_at.isoformat(),
        }
        for export in service.list_exports()
    ]


@router.post("")
def create_export(payload: ExportCreateRequest, service: AppService = Depends(get_service)) -> dict:
    try:
        export = service.create_export(payload.run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {
        "export_id": export.id,
        "run_id": export.run_id,
        "status": export.status,
        "created_at": export.created_at.isoformat(),
    }


@router.get("/{export_id}")
def get_export(export_id: str, service: AppService = Depends(get_service)) -> dict:
    try:
        export = service.get_export(export_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {
        "export_id": export.id,
        "run_id": export.run_id,
        "status": export.status,
        "bundle_key": export.bundle_key,
        "manifest_key": export.manifest_key,
        "created_at": export.created_at.isoformat(),
        "finished_at": export.finished_at.isoformat() if export.finished_at else None,
        "error_message": export.error_message,
    }


@router.get("/{export_id}/download")
def download_export(export_id: str, service: AppService = Depends(get_service)) -> Response:
    export = service.get_export(export_id)
    if not export.bundle_key:
        raise HTTPException(status_code=404, detail="export bundle is not ready")
    content = service.storage.get_bytes(export.bundle_key)
    content_type = mimetypes.guess_type(export.bundle_key)[0] or "application/octet-stream"
    filename = export.bundle_key.split("/")[-1]
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return Response(content=content, media_type=content_type, headers=headers)
