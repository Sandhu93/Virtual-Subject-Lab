import logging
import time

from virtual_subject.config import get_settings
from virtual_subject.db.bootstrap import init_db
from virtual_subject.db.session import SessionLocal
from virtual_subject.services.app_service import AppService

settings = get_settings()
logger = logging.getLogger("virtual_subject.worker")


def main() -> None:
    logging.basicConfig(level=settings.log_level)
    logger.info("worker started in %s mode", settings.tribe_mode)
    init_db()
    while True:
        with SessionLocal() as db:
            service = AppService(db)
            service.update_worker_heartbeat("worker-1", "idle")
            job = service.claim_next_job()
            if job is not None:
                try:
                    service.update_worker_heartbeat("worker-1", "running", {"job_id": job.id, "kind": job.kind})
                    if job.kind == "run_prediction":
                        service.process_run_job(job.owner_id)
                    elif job.kind == "export_bundle":
                        service.process_export_job(job.owner_id)
                    else:
                        raise ValueError(f"Unsupported job kind {job.kind}")
                    service.complete_job(job)
                    service.update_worker_heartbeat("worker-1", "idle")
                except Exception as exc:  # pragma: no cover
                    logger.exception("worker job failed")
                    service.fail_job(job, str(exc))
                    service.update_worker_heartbeat("worker-1", "error", {"error": str(exc)})
        time.sleep(settings.worker_poll_seconds)


if __name__ == "__main__":
    main()
