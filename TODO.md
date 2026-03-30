# TODO

## Completed (MVP)

- [x] Read local product spec files.
- [x] Inspect TRIBE v2 public inference API and package metadata.
- [x] Inspect Oat repo and pin an exact release target.
- [x] Create scaffold repo structure, Python package baseline, and compose stack.
- [x] Implement config, DB models, migrations, and storage adapters.
- [x] Implement deterministic mock adapter and worker job loop.
- [x] Implement stimuli, runs, analysis, exports, and atlas endpoints.
- [x] Implement a separate Oat-based frontend and connect it to the API over HTTP.
- [x] Implement export manifests, caching, and provenance capture.
- [x] Add unit, API, worker, and smoke tests.
- [x] Verify the stack in Docker Compose.
- [x] Vendor the Oat assets locally instead of using the pinned CDN path.

## Completed (post-review fixes — 2026-03-31)

- [x] **tribev2 dependency declared**: `requirements-real.txt` lists upstream install
      instructions; `RealTribeAdapter.__init__` raises a clear `ImportError` with
      remediation text when the package is missing; `.env.example` annotated with
      real-mode prerequisites.

- [x] **`/analysis/contrast` endpoint**: renamed from `/analysis/compare`; now
      computes a vertex-level `(n_vertices,)` mean-difference array, persists it to
      storage, returns `contrast_id` + `vertices_url`; new `contrasts` DB table +
      Alembic migration `20260331_000002`; `GET /analysis/contrast/{id}` and
      `GET /analysis/contrast/{id}/download` added.

- [x] **`GET /runs/{id}/frames/{t}/vertices`**: new endpoint returns a binary
      little-endian float32 stream of per-vertex prediction values; existing
      `GET /runs/{id}/frames/{t}` response now includes `vertices_url`.

- [x] **Transcript surfaced in API + UI**: `GET /stimuli` and `GET /stimuli/{id}`
      now return `transcript` (text) and `word_timing_status`; stimuli table in the
      browser shows both columns; worker back-fills `transcript_text` in
      `stimulus_metadata` after the first run processes the events dataframe.

- [x] **Scripts directory populated**:
      - `scripts/bootstrap.sh` — one-shot dev env setup (venv, pip, alembic, atlases)
      - `scripts/load_atlases.py` — downloads real fsaverage5 via nilearn/nibabel or
        generates a level-5 icosphere fallback; writes `packages/atlas-assets/`
      - `scripts/backfill_checksums.py` — recomputes missing sha256 checksums
      - `scripts/smoke_test.py` — full end-to-end workflow test against a live API

- [x] **`packages/atlas-assets/` mesh endpoint**: `GET /atlases/fsaverage5/metadata`,
      `GET /atlases/fsaverage5/mesh/{hemi}/{file}`, and
      `GET /atlases/lab_roi_pack_v1/roi_index` added to the atlases router; files
      are served from `packages/atlas-assets/` after `load_atlases.py` runs.

- [x] **WebGL cortical surface viewer** (`apps/frontend/public/assets/js/viewer.js`):
      - Replaces the SVG hemisphere schematic with a real WebGL renderer.
      - Renders both hemispheres as 3-D coloured surfaces (level-5 icosphere fallback
        until real fsaverage5 mesh is loaded via `load_atlases.py`).
      - Per-vertex data fetched from `GET /runs/{id}/frames/{t}/vertices`.
      - Hot colormap, threshold-based dimming, mouse-orbit camera, touch support.
      - Play/pause animation loop, snapshot-to-PNG download.
      - Hemisphere toggle (left/right/both), parcel overlay hook.

- [x] **Viewer state in URL hash params**: ablation, threshold, hemisphere, and time
      index are written into the hash after every workspace load
      (`#/runs?id=…&ablation=full&threshold=0.25&hemisphere=both&time=0`).
      State is restored on page load / navigation so links are fully shareable.

## Remaining (Phase 2)

- [ ] Replace the icosphere placeholder with real fsaverage5 vertex positions
      (run `python scripts/load_atlases.py` after `pip install nilearn nibabel`).
- [ ] Add HCP Glasser full parcel labels (requires ConnectomeDB license).
- [ ] Add parcel boundary overlay rendering in the WebGL viewer.
- [ ] Hot-spot picker: click a vertex → show nearest ROI label.
- [ ] Subject-specific fine-tuning UI (Phase 2 research feature).
- [ ] Subcortical output support.
- [ ] User annotations / saved workspaces.
- [ ] Real-time streaming inference.
- [ ] Authentication (login / JWT) — intentionally deferred for internal research use.
