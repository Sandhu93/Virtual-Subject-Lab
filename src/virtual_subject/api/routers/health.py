from datetime import UTC, datetime, timedelta

from fastapi import APIRouter
from sqlalchemy import text

from virtual_subject.adapters.storage import get_storage
from virtual_subject.config import get_settings
from virtual_subject.db.models import WorkerHeartbeat
from virtual_subject.db.session import SessionLocal, engine

router = APIRouter(tags=["health"])
settings = get_settings()


@router.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "api",
        "version": "0.1.0",
        "timestamp": datetime.now(UTC).isoformat(),
    }


@router.get("/health/db")
def health_db() -> dict[str, str]:
    with engine.connect() as connection:
        connection.execute(text("select 1"))
    return {"status": "ok", "service": "db"}


@router.get("/health/storage")
def health_storage() -> dict[str, str]:
    storage = get_storage()
    _ = storage.__class__.__name__
    return {
        "status": "ok",
        "service": "storage",
        "backend": settings.storage_backend,
    }


@router.get("/health/worker")
def health_worker() -> dict[str, str]:
    with SessionLocal() as db:
        heartbeat = db.get(WorkerHeartbeat, "worker-1")
    if heartbeat is None:
        return {
            "status": "unknown",
            "service": "worker",
            "mode": settings.tribe_mode,
            "detail": "worker has not reported in yet",
        }
    stale = datetime.now(UTC) - heartbeat.last_seen_at > timedelta(seconds=settings.worker_poll_seconds * 5)
    return {
        "status": "stale" if stale else "ok",
        "service": "worker",
        "mode": heartbeat.mode,
        "last_seen_at": heartbeat.last_seen_at.isoformat(),
    }
