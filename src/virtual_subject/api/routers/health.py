from datetime import UTC, datetime

from fastapi import APIRouter

from virtual_subject.config import get_settings

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
    return {"status": "unknown", "service": "db", "detail": "database probe not implemented yet"}


@router.get("/health/storage")
def health_storage() -> dict[str, str]:
    return {
        "status": "unknown",
        "service": "storage",
        "backend": settings.storage_backend,
        "detail": "storage probe not implemented yet",
    }


@router.get("/health/worker")
def health_worker() -> dict[str, str]:
    return {
        "status": "unknown",
        "service": "worker",
        "mode": settings.tribe_mode,
        "detail": "worker heartbeat not implemented yet",
    }

