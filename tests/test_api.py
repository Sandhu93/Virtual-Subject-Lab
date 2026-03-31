from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from virtual_subject.api.main import app

client = TestClient(app)


# ── Health ────────────────────────────────────────────────────────────────────

def test_health_ok():
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_root_returns_service_info():
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["service"] == "virtual-subject-api"


# ── Stimuli ───────────────────────────────────────────────────────────────────

def test_list_stimuli_empty():
    r = client.get("/api/v1/stimuli")
    assert r.status_code == 200
    assert r.json() == []


def test_create_text_stimulus():
    r = client.post("/api/v1/stimuli/text", json={"name": "Demo", "text": "The cat sat on the mat"})
    assert r.status_code == 200
    data = r.json()
    assert data["source_type"] == "text"
    assert data["status"] == "ready"
    assert "stimulus_id" in data


def test_create_text_stimulus_empty_text_fails():
    r = client.post("/api/v1/stimuli/text", json={"name": "Bad", "text": "  "})
    assert r.status_code == 400


def test_get_stimulus_not_found():
    r = client.get("/api/v1/stimuli/stim_doesnotexist")
    assert r.status_code == 404


def test_list_stimuli_after_create():
    client.post("/api/v1/stimuli/text", json={"name": "A", "text": "first sentence"})
    client.post("/api/v1/stimuli/text", json={"name": "B", "text": "second sentence"})
    r = client.get("/api/v1/stimuli")
    assert r.status_code == 200
    assert len(r.json()) == 2


# ── Runs ──────────────────────────────────────────────────────────────────────

def test_list_runs_empty():
    r = client.get("/api/v1/runs")
    assert r.status_code == 200
    assert r.json() == []


def test_create_run_queued():
    stim = client.post("/api/v1/stimuli/text", json={"name": "T", "text": "some words here"}).json()
    r = client.post("/api/v1/runs", json={"stimulus_id": stim["stimulus_id"]})
    assert r.status_code == 200
    run = r.json()
    assert run["status"] == "queued"
    assert not run["cached"]


def test_create_run_missing_stimulus_fails():
    r = client.post("/api/v1/runs", json={"stimulus_id": "stim_doesnotexist"})
    assert r.status_code == 400


def test_get_run_not_found():
    r = client.get("/api/v1/runs/run_doesnotexist")
    assert r.status_code == 404


def test_get_run_after_create():
    stim = client.post("/api/v1/stimuli/text", json={"name": "T2", "text": "another sentence"}).json()
    run = client.post("/api/v1/runs", json={"stimulus_id": stim["stimulus_id"]}).json()
    r = client.get(f"/api/v1/runs/{run['run_id']}")
    assert r.status_code == 200
    assert r.json()["run_id"] == run["run_id"]


# ── Exports ───────────────────────────────────────────────────────────────────

def test_list_exports_empty():
    r = client.get("/api/v1/exports")
    assert r.status_code == 200
    assert r.json() == []


# ── Atlases ───────────────────────────────────────────────────────────────────

def test_list_atlases():
    r = client.get("/api/v1/atlases")
    assert r.status_code == 200
    atlases = r.json()
    assert isinstance(atlases, list)
    assert len(atlases) >= 1
    assert "atlas_id" in atlases[0]
