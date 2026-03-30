from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from virtual_subject.api.deps import get_service
from virtual_subject.api.schemas.models import StimulusCreateRequest, StimulusTextRequest
from virtual_subject.services.app_service import AppService

router = APIRouter(prefix="/stimuli", tags=["stimuli"])


def _serialize_stimulus(stimulus) -> dict:
    meta = stimulus.metadata_row
    transcript_text = meta.transcript_text if meta else None
    # word_timing_status reflects whether events with time-aligned tokens exist.
    # For text stimuli the transcript is the original text (word timings are
    # derived by the TRIBE adapter via TTS). For audio/video the transcript is
    # populated after the run worker calls get_events_dataframe.
    if transcript_text:
        word_timing_status = "available"
    elif stimulus.source_type == "text":
        word_timing_status = "pending_run"  # will be derived from TTS on first run
    else:
        word_timing_status = "pending_run"

    return {
        "stimulus_id": stimulus.id,
        "name": stimulus.name,
        "source_type": stimulus.source_type,
        "status": stimulus.status,
        "mime_type": stimulus.mime_type,
        "modalities": stimulus.modalities,
        "duration_seconds": stimulus.duration_seconds,
        "checksum": stimulus.checksum_sha256,
        "created_at": stimulus.created_at.isoformat(),
        "transcript": transcript_text,
        "word_timing_status": word_timing_status,
    }


@router.get("")
def list_stimuli(service: AppService = Depends(get_service)) -> list[dict]:
    return [_serialize_stimulus(item) for item in service.list_stimuli()]


@router.post("")
def create_stimulus(
    payload: StimulusCreateRequest,
    service: AppService = Depends(get_service),
) -> dict:
    try:
        stimulus = service.create_upload_stimulus(
            name=payload.name,
            source_type=payload.source_type,
            mime_type=payload.mime_type,
            filename=payload.filename,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        **_serialize_stimulus(stimulus),
        "upload_url": f"/api/v1/stimuli/{stimulus.id}/content",
        "finalize_url": f"/api/v1/stimuli/{stimulus.id}/finalize",
    }


@router.put("/{stimulus_id}/content")
async def upload_stimulus_content(
    stimulus_id: str,
    file: UploadFile = File(...),
    service: AppService = Depends(get_service),
) -> dict:
    content = await file.read()
    stimulus = service.upload_stimulus_content(stimulus_id, file.filename or "upload.bin", content)
    return _serialize_stimulus(stimulus)


@router.post("/{stimulus_id}/finalize")
def finalize_stimulus(stimulus_id: str, service: AppService = Depends(get_service)) -> dict:
    try:
        stimulus = service.finalize_stimulus(stimulus_id)
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _serialize_stimulus(stimulus)


@router.post("/text")
def create_text_stimulus(
    payload: StimulusTextRequest,
    service: AppService = Depends(get_service),
) -> dict:
    try:
        stimulus = service.create_text_stimulus(payload.name, payload.text)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _serialize_stimulus(stimulus)


@router.get("/{stimulus_id}")
def get_stimulus(stimulus_id: str, service: AppService = Depends(get_service)) -> dict:
    try:
        return _serialize_stimulus(service.get_stimulus(stimulus_id))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

