from virtual_subject.db.session import SessionLocal
from virtual_subject.services.app_service import AppService


def test_mock_pipeline_and_export() -> None:
    with SessionLocal() as db:
        service = AppService(db)
        stimulus = service.create_text_stimulus("Probe", "A brief language localizer sentence.")
        run, cached = service.create_run(stimulus.id, ["full", "text_only", "audio_only"])
        assert cached is False

        job = service.claim_next_job()
        assert job is not None
        assert job.kind == "run_prediction"

        service.process_run_job(run.id)
        service.complete_job(job)

        timeline = service.get_timeline(run.id, "full")
        assert timeline["n_timesteps"] >= 4

        frame = service.get_frame(run.id, "full", 0)
        assert len(frame["roi_frame"]) == len(service.atlas.roi_metadata())

        export = service.create_export(run.id)
        export_job = service.claim_next_job()
        assert export_job is not None
        assert export_job.kind == "export_bundle"
        service.process_export_job(export.id)
        service.complete_job(export_job)

        export_detail = service.get_export(export.id)
        assert export_detail.status == "succeeded"
        assert export_detail.bundle_key is not None
