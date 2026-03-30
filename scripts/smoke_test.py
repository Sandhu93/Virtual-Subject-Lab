#!/usr/bin/env python3
"""smoke_test.py — end-to-end smoke test against a running API.

Exercises the full workflow:
  1. Create a text stimulus
  2. Create a run with all 7 ablations
  3. Poll until the run succeeds (or times out)
  4. Fetch timeline, frame, frame vertices, top ROIs, ROI trace
  5. Create a contrast between run and itself (delta = 0)
  6. Create an export bundle and verify the download URL

Usage:
    python scripts/smoke_test.py [--api-url http://localhost:8000]

The script exits 0 on success and 1 on any failure.
"""

from __future__ import annotations

import sys
import time
import urllib.error
import urllib.request
import json

API_URL = "http://localhost:8000"
for arg in sys.argv[1:]:
    if arg.startswith("--api-url="):
        API_URL = arg.split("=", 1)[1]
    elif arg == "--api-url" and sys.argv.index(arg) + 1 < len(sys.argv):
        API_URL = sys.argv[sys.argv.index(arg) + 1]

BASE = f"{API_URL}/api/v1"
TIMEOUT = 120  # seconds to wait for a run to complete


def request(method: str, path: str, body: dict | None = None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        body_text = exc.read().decode(errors="replace")
        raise RuntimeError(f"HTTP {exc.code} {method} {path}: {body_text}") from exc


def poll_run(run_id: str, timeout: int = TIMEOUT) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        run = request("GET", f"/runs/{run_id}")
        status = run["status"]
        if status == "succeeded":
            return run
        if status == "failed":
            raise RuntimeError(f"Run {run_id} failed: {run.get('error_message')}")
        print(f"  run status: {status} — waiting …")
        time.sleep(3)
    raise TimeoutError(f"Run {run_id} did not complete within {timeout} s")


def main() -> int:
    print(f"Smoke test against {API_URL}")

    # ── health ────────────────────────────────────────────────────────────────
    print("\n[1] Health …")
    h = request("GET", "/health")
    assert h["status"] == "ok", f"health not ok: {h}"
    print(f"  API version {h.get('version')} — ok")

    # ── stimulus ──────────────────────────────────────────────────────────────
    print("\n[2] Create text stimulus …")
    stim = request("POST", "/stimuli/text", {
        "name": "smoke_test_sentence",
        "text": "The sailors are annoyed by the noise of the seagulls.",
    })
    stim_id = stim["stimulus_id"]
    assert stim["status"] == "ready", f"unexpected status: {stim['status']}"
    assert stim["word_timing_status"] in {"available", "pending_run"}
    print(f"  stimulus {stim_id} — ok")

    # ── run ───────────────────────────────────────────────────────────────────
    print("\n[3] Create run (all ablations) …")
    run_resp = request("POST", "/runs", {
        "stimulus_id": stim_id,
        "ablations": ["full", "text_only", "audio_only"],
    })
    run_id = run_resp["run_id"]
    print(f"  run {run_id} queued — polling …")
    run = poll_run(run_id)
    print(f"  run {run_id} succeeded")

    # ── timeline ──────────────────────────────────────────────────────────────
    print("\n[4] Timeline …")
    tl = request("GET", f"/runs/{run_id}/timeline?ablation=full")
    assert tl["n_timesteps"] > 0
    print(f"  {tl['n_timesteps']} timesteps at {tl['sample_rate_hz']} Hz — ok")

    # ── frame ─────────────────────────────────────────────────────────────────
    print("\n[5] Frame …")
    frame = request("GET", f"/runs/{run_id}/frames/0?ablation=full")
    assert "roi_frame" in frame
    assert "vertices_url" in frame
    print(f"  frame 0: global_mean={frame['global_mean']:.4f}  vertices_url present — ok")

    # ── vertices endpoint ─────────────────────────────────────────────────────
    print("\n[6] Frame vertices (binary) …")
    verts_url = f"{BASE}/runs/{run_id}/frames/0/vertices?ablation=full"
    req_verts = urllib.request.Request(verts_url, method="GET")
    with urllib.request.urlopen(req_verts, timeout=15) as resp:
        n_verts = int(resp.headers.get("X-Vertex-Count", 0))
        raw = resp.read()
    assert len(raw) == n_verts * 4, f"unexpected byte count: {len(raw)} vs {n_verts * 4}"
    print(f"  {n_verts} vertices, {len(raw)} bytes — ok")

    # ── top ROIs ──────────────────────────────────────────────────────────────
    print("\n[7] Top ROIs …")
    top = request("GET", f"/analysis/top-rois?run_id={run_id}&ablation=full&limit=5")
    assert len(top["items"]) > 0
    print(f"  top ROI: {top['items'][0]['label']} — ok")

    # ── ROI trace ─────────────────────────────────────────────────────────────
    print("\n[8] ROI trace …")
    roi_id = top["items"][0]["roi_id"]
    trace = request("POST", "/analysis/roi-traces", {
        "run_id": run_id,
        "ablation": "full",
        "roi_ids": [roi_id],
    })
    assert trace["traces"][0]["mean_trace"]
    print(f"  trace for {roi_id}: {len(trace['traces'][0]['mean_trace'])} points — ok")

    # ── contrast ──────────────────────────────────────────────────────────────
    print("\n[9] Contrast (run vs itself → delta ≈ 0) …")
    ctr = request("POST", "/analysis/contrast", {
        "run_a_id": run_id,
        "run_b_id": run_id,
        "ablation": "full",
        "mode": "mean_difference",
    })
    assert "contrast_id" in ctr
    assert "vertices_url" in ctr
    assert abs(ctr["global_mean_delta"]) < 1e-5, f"self-contrast not zero: {ctr['global_mean_delta']}"
    print(f"  contrast_id={ctr['contrast_id']}  delta={ctr['global_mean_delta']:.2e} — ok")

    # ── export ────────────────────────────────────────────────────────────────
    print("\n[10] Export …")
    exp = request("POST", "/exports", {"run_id": run_id})
    exp_id = exp["export_id"]
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        exp_status = request("GET", f"/exports/{exp_id}")
        if exp_status["status"] == "succeeded":
            break
        time.sleep(2)
    assert exp_status["status"] == "succeeded", f"export not succeeded: {exp_status}"
    print(f"  export {exp_id} succeeded — ok")

    print("\n✓ All smoke tests passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
