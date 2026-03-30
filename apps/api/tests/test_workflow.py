from fastapi.testclient import TestClient

from virtual_subject.api.main import app
from virtual_subject.db.session import SessionLocal
from virtual_subject.services.app_service import AppService


def test_text_stimulus_and_run_workflow() -> None:
    with TestClient(app) as client:
        stimulus = client.post(
            "/api/v1/stimuli/text",
            json={"name": "Sentence", "text": "The sailors are annoyed by the noise of the seagulls."},
        )
        assert stimulus.status_code == 200
        stimulus_payload = stimulus.json()
        assert stimulus_payload["status"] == "ready"

        run = client.post(
            "/api/v1/runs",
            json={
                "stimulus_id": stimulus_payload["stimulus_id"],
                "ablations": ["full", "text_only", "audio_only", "text_audio"],
            },
        )
        assert run.status_code == 200
        run_payload = run.json()
        assert run_payload["status"] in {"queued", "succeeded"}

        with SessionLocal() as db:
            service = AppService(db)
            job = service.claim_next_job()
            assert job is not None
            service.process_run_job(job.owner_id)
            service.complete_job(job)

        run_detail = client.get(f"/api/v1/runs/{run_payload['run_id']}")
        assert run_detail.status_code == 200
        assert run_detail.json()["status"] == "succeeded"

        timeline = client.get(f"/api/v1/runs/{run_payload['run_id']}/timeline?ablation=full")
        assert timeline.status_code == 200
        assert timeline.json()["n_timesteps"] >= 4

        top_rois = client.get(f"/api/v1/analysis/top-rois?run_id={run_payload['run_id']}&ablation=full&limit=5")
        assert top_rois.status_code == 200
        assert len(top_rois.json()["items"]) == 5

