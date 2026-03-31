from __future__ import annotations

import pytest

from virtual_subject.db.session import SessionLocal
from virtual_subject.services.app_service import AppService


def _svc() -> AppService:
    """Return a new AppService bound to a fresh SessionLocal session.

    Tests must use this inside a `with SessionLocal() as db:` block, or call
    db.close() themselves.  Because the root conftest.py reset_state fixture
    recreates tables before each test, each call always starts with a clean DB.
    """
    db = SessionLocal()
    return AppService(db), db


# ── Stimulus ─────────────────────────────────────────────────────────────────

def test_list_stimuli_empty():
    svc, db = _svc()
    with db:
        assert svc.list_stimuli() == []


def test_create_text_stimulus():
    svc, db = _svc()
    with db:
        stim = svc.create_text_stimulus("Hello", "The cat sat on the mat.")
        assert stim.status == "ready"
        assert stim.source_type == "text"
        assert stim.checksum_sha256 is not None
        assert stim.duration_seconds > 0
        assert stim.text_content == "The cat sat on the mat."


def test_create_text_stimulus_empty_text_raises():
    svc, db = _svc()
    with db:
        with pytest.raises(ValueError):
            svc.create_text_stimulus("Bad", "   ")


def test_list_stimuli_returns_created():
    svc, db = _svc()
    with db:
        svc.create_text_stimulus("A", "first")
        svc.create_text_stimulus("B", "second")
        items = svc.list_stimuli()
        assert len(items) == 2


# ── Run ───────────────────────────────────────────────────────────────────────

def test_create_run_queues_job():
    svc, db = _svc()
    with db:
        stim = svc.create_text_stimulus("T", "The quick brown fox")
        run, cached = svc.create_run(stim.id)
        assert not cached
        assert run.status == "queued"
        assert run.stimulus_id == stim.id
        job = svc.claim_next_job()
        assert job is not None
        assert job.kind == "run_prediction"
        assert job.owner_id == run.id


def test_create_run_fails_on_unready_stimulus():
    svc, db = _svc()
    with db:
        stim = svc.create_upload_stimulus("Up", "audio", "audio/wav", "test.wav")
        with pytest.raises(ValueError, match="ready"):
            svc.create_run(stim.id)


def test_process_run_job_end_to_end():
    svc, db = _svc()
    with db:
        stim = svc.create_text_stimulus("Story", "The dog barked loudly at the fence")
        run, _ = svc.create_run(stim.id)
        job = svc.claim_next_job()
        svc.process_run_job(job.owner_id)
        svc.complete_job(job)

        updated = svc.get_run(run.id)
        assert updated.status == "succeeded"

        ablations = svc.get_run_ablations(run.id)
        assert len(ablations) == 1
        abl = ablations[0]
        assert abl.ablation == "full"
        assert abl.status == "succeeded"
        assert abl.tensor_key is not None
        assert abl.n_vertices is not None


def test_run_caching_returns_same_run():
    svc, db = _svc()
    with db:
        stim = svc.create_text_stimulus("Cache", "hello world test")
        run1, cached1 = svc.create_run(stim.id)
        assert not cached1

        job = svc.claim_next_job()
        svc.process_run_job(job.owner_id)
        svc.complete_job(job)

        run2, cached2 = svc.create_run(stim.id)
        assert cached2
        assert run2.id == run1.id


def test_get_timeline_after_run():
    svc, db = _svc()
    with db:
        stim = svc.create_text_stimulus("TL", "short text for timeline check")
        run, _ = svc.create_run(stim.id)
        job = svc.claim_next_job()
        svc.process_run_job(job.owner_id)
        svc.complete_job(job)

        timeline = svc.get_timeline(run.id, "full")
        assert timeline["run_id"] == run.id
        assert isinstance(timeline["global_signal"], list)
        assert len(timeline["global_signal"]) > 0


def test_get_frame_after_run():
    svc, db = _svc()
    with db:
        stim = svc.create_text_stimulus("FR", "frame test text input here")
        run, _ = svc.create_run(stim.id)
        job = svc.claim_next_job()
        svc.process_run_job(job.owner_id)
        svc.complete_job(job)

        frame = svc.get_frame(run.id, "full", 0)
        assert frame["time_index"] == 0
        assert "roi_frame" in frame
        assert "vertices_url" in frame


def test_top_rois_after_run():
    svc, db = _svc()
    with db:
        stim = svc.create_text_stimulus("ROI", "test top rois output")
        run, _ = svc.create_run(stim.id)
        job = svc.claim_next_job()
        svc.process_run_job(job.owner_id)
        svc.complete_job(job)

        top = svc.get_top_rois(run.id, "full", 5)
        assert top["run_id"] == run.id
        assert len(top["items"]) == 5
        for item in top["items"]:
            assert "roi_id" in item
            assert "peak_response" in item


def test_create_contrast():
    svc, db = _svc()
    with db:
        s1 = svc.create_text_stimulus("S1", "cats are very nice animals")
        s2 = svc.create_text_stimulus("S2", "dogs are very good animals")

        run1, _ = svc.create_run(s1.id)
        job = svc.claim_next_job()
        svc.process_run_job(job.owner_id)
        svc.complete_job(job)

        run2, _ = svc.create_run(s2.id)
        job = svc.claim_next_job()
        svc.process_run_job(job.owner_id)
        svc.complete_job(job)

        result = svc.create_contrast(run1.id, run2.id, "full")
        assert "contrast_id" in result
        assert isinstance(result["global_mean_delta"], float)
        assert result["run_a_id"] == run1.id
        assert result["run_b_id"] == run2.id


# ── Export ───────────────────────────────────────────────────────────────────

def test_export_bundle():
    svc, db = _svc()
    with db:
        stim = svc.create_text_stimulus("Exp", "export bundle test text")
        run, _ = svc.create_run(stim.id)
        job = svc.claim_next_job()
        svc.process_run_job(job.owner_id)
        svc.complete_job(job)

        export = svc.create_export(run.id)
        assert export.status == "queued"

        exp_job = svc.claim_next_job()
        assert exp_job.kind == "export_bundle"
        svc.process_export_job(exp_job.owner_id)
        svc.complete_job(exp_job)

        updated = svc.get_export(export.id)
        assert updated.status == "succeeded"
        assert updated.bundle_key is not None
