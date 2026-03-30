from fastapi.testclient import TestClient

from virtual_subject.api.main import app
from virtual_subject.db.session import SessionLocal
from virtual_subject.services.app_service import AppService


def test_smoke_mock_stack_path() -> None:
    with TestClient(app) as client:
        stimulus = client.post(
            "/api/v1/stimuli/text",
            json={"name": "Smoke", "text": "A short multimodal hypothesis-testing prompt."},
        ).json()
        run = client.post(
            "/api/v1/runs",
            json={"stimulus_id": stimulus["stimulus_id"], "ablations": ["full", "text_only"]},
        ).json()

        with SessionLocal() as db:
            service = AppService(db)
            while True:
                job = service.claim_next_job()
                if job is None:
                    break
                if job.kind == "run_prediction":
                    service.process_run_job(job.owner_id)
                elif job.kind == "export_bundle":
                    service.process_export_job(job.owner_id)
                service.complete_job(job)

        response = client.get(f"/api/v1/runs/{run['run_id']}")
        assert response.status_code == 200
        assert response.json()["status"] == "succeeded"

