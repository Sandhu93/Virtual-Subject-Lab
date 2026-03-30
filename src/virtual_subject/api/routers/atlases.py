from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, Response

from virtual_subject.api.deps import get_service
from virtual_subject.services.app_service import AppService

router = APIRouter(prefix="/atlases", tags=["atlases"])

# Resolve packages/atlas-assets from the repo root.  Works whether the app
# is run from the repo root or from inside the src/ package directory.
_REPO_ROOT = Path(__file__).resolve().parents[5]
_ATLAS_ASSETS = _REPO_ROOT / "packages" / "atlas-assets"


@router.get("")
def list_atlases(service: AppService = Depends(get_service)) -> list[dict]:
    return service.atlas.list_atlases()


@router.get("/{atlas_id}/rois")
def atlas_rois(atlas_id: str, service: AppService = Depends(get_service)) -> dict:
    if atlas_id != service.atlas.atlas_id:
        return {"atlas_id": atlas_id, "items": []}
    return {"atlas_id": atlas_id, "items": service.atlas.roi_metadata()}


@router.get("/fsaverage5/metadata")
def fsaverage5_metadata() -> dict:
    """Return mesh metadata JSON for fsaverage5.

    Run scripts/load_atlases.py first to generate these files.
    """
    meta_path = _ATLAS_ASSETS / "fsaverage5" / "metadata.json"
    if not meta_path.exists():
        raise HTTPException(
            status_code=404,
            detail="fsaverage5 assets not found. Run: python scripts/load_atlases.py",
        )
    import json
    return json.loads(meta_path.read_text())


@router.get("/fsaverage5/mesh/{hemisphere}/{file}")
def fsaverage5_mesh_file(hemisphere: str, file: str) -> Response:
    """Serve a binary mesh asset (left_mesh.bin, faces_left.bin, etc.).

    The WebGL viewer fetches these to build the cortical surface geometry.
    Run scripts/load_atlases.py first.

    Allowed file names: left_mesh.bin, right_mesh.bin,
    vertex_normals_left.bin, vertex_normals_right.bin,
    faces_left.bin, faces_right.bin.
    """
    allowed = {
        "left_mesh.bin", "right_mesh.bin",
        "vertex_normals_left.bin", "vertex_normals_right.bin",
        "faces_left.bin", "faces_right.bin",
    }
    if file not in allowed:
        raise HTTPException(status_code=400, detail=f"Unknown mesh file {file!r}")

    asset_path = _ATLAS_ASSETS / "fsaverage5" / file
    if not asset_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Mesh file {file} not found. Run: python scripts/load_atlases.py",
        )
    return FileResponse(
        path=asset_path,
        media_type="application/octet-stream",
        filename=file,
    )


@router.get("/lab_roi_pack_v1/roi_index")
def lab_roi_index() -> dict:
    """Serve the lab ROI pack index JSON."""
    roi_path = _ATLAS_ASSETS / "lab_roi_pack_v1" / "roi_index.json"
    if not roi_path.exists():
        raise HTTPException(
            status_code=404,
            detail="ROI index not found. Run: python scripts/load_atlases.py",
        )
    import json
    return {"items": json.loads(roi_path.read_text())}
