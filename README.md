# virtual-subject

A research-grade TRIBE v2 web app for lab teaching and hypothesis testing.

Upload text, audio, or video. The app predicts cortical hemodynamic responses for an average virtual subject using the TRIBE v2 pretrained model. Inspect the 3-D brain map over time, explore ROI traces, compare modality ablations, contrast two stimuli, and export reproducible artifacts.

> **Scientific caveats (always visible in the UI)**
> - Average unseen subject only — not personalized predictions.
> - Predicted BOLD-like (fMRI) responses, not neuronal firing.
> - 1 Hz output with ~5-second hemodynamic lag.
> - Research use only. Upstream TRIBE v2 is CC BY-NC 4.0.

---

## How to use the app

### Step 1 — Create a stimulus

Go to **1 · Stimuli** in the navigation.

You have two input paths:

**Text** — paste any sentence or paragraph into the text box and click *Create text stimulus*. The app computes duration automatically from word count.

**Audio / Video** — give the upload a name, choose the source type (audio or video), pick a file, and click *Upload and finalize*. Supported formats: WAV, MP3, MP4, MOV.

Once created, the stimulus appears in the library table at the bottom of the page with its detected modalities, duration, transcript (when available), and word-timing status.

---

### Step 2 — Queue a run

Still on the **Stimuli** page, use the *Step 2 — Run* card on the right.

1. Select the stimulus you just created from the dropdown.
2. Optionally edit the ablations field (comma-separated). The default runs all seven:
   `full, text_only, audio_only, video_only, text_audio, text_video, audio_video`
3. Click *Queue run*.

The app navigates automatically to the run workspace.

---

### Step 3 — Inspect results in the run workspace

Go to **2 · Runs** and select your run from the dropdown, or follow the link from Step 2.

While the worker is processing, the page polls every 3 seconds and shows a *waiting* spinner. When the run succeeds, the workspace loads:

**Left sidebar — controls**
- *Run / Ablation* — switch between runs and ablations (full, text_only, etc.).
- *ROI quick-pick* — select which brain region's time trace to display.
- *Activation threshold* — hide low-activation vertices in the 3-D viewer.
- *Time scrubber* — step through timepoints (1 per second, up to ~100 s).
- *Hemisphere / Parcel overlay* — toggle right-only view and parcel boundaries.
- *Export bundle* — queue an export for this run.

**Centre — cortical viewer**
- Drag to rotate, scroll to zoom.
- Vertices are coloured by predicted BOLD-like activation (hot colormap).
- Use *Play / Pause* to animate the full time series.
- *Snapshot* saves a PNG of the current view.
- The global signal sparkline below the viewer shows mean activation over time.

**Right sidebar — ROI summaries**
- *Top responding ROIs* — the 10 highest-peak brain regions with peak value and latency.
- *ROI trace* — a time-series chart for the quick-pick ROI you selected.

The URL hash updates automatically (`#/runs?id=…&ablation=…&threshold=…`) so any view can be bookmarked or shared.

---

### Step 4 — Compare two runs

Go to **3 · Compare**.

You need at least two succeeded runs. Select *Run A* and *Run B*, choose an ablation condition, and click *Compare runs*. The app computes the vertex-level mean difference and shows a per-ROI contrast table (Δ values coloured green/red).

---

### Step 5 — Export

Go to **4 · Export**, or use the *Export bundle* button in the run workspace sidebar.

Select a succeeded run and click *Queue export*. The worker packages:

| File | Contents |
|------|----------|
| `manifest.json` | Provenance: model ID, commit SHA, input hash, atlas version, timestamps |
| `{ablation}/prediction.npy` | Raw `(T, V)` float32 tensor for every ablation |
| `{ablation}/roi_traces.json` | Per-ROI mean traces |
| `{ablation}/preview.png` | Static cortical map at peak activation time |

When the export is ready, click *Download* to get the `.zip`.

---

### Home dashboard

The **Home** page shows your current pipeline state at a glance: which steps are done (green checkmark), live counts of stimuli/runs/exports, and a *Next step* call-to-action button that points you to exactly what to do next.

---

## Quickstart (Docker Compose — mock mode, no GPU required)

```bash
git clone <this-repo> virtual-subject
cd virtual-subject
cp .env.example .env
docker compose -f infra/compose.yaml up --build
```

Open `http://localhost:3000`. The API is at `http://localhost:8000`. MinIO console at `http://localhost:9001` (admin / minioadmin).

Mock mode is the default (`TRIBE_MODE=mock`). The worker generates deterministic synthetic predictions so the full pipeline — create stimulus, queue run, inspect brain map, compare, export — works without any GPU or model download.

---

## Real model inference (GPU required)

Real inference requires the upstream `tribev2` package and a CUDA GPU.

```bash
# Install the upstream package (not published to PyPI; install from source)
pip install -r requirements-real.txt

# Point the app at the real adapter
export TRIBE_MODE=real
export TRIBE_MODEL_ID=facebook/tribev2
export TRIBE_DEVICE=cuda          # or cpu (very slow)
export TRIBE_CACHE_DIR=.cache/tribe

docker compose -f infra/compose.yaml up --build
```

On first run the worker lazy-loads `TribeModel.from_pretrained("facebook/tribev2")` and caches it locally. Subsequent runs reuse the cached model. Inference time depends on GPU speed and stimulus duration; a ~60-second clip on a V100 takes a few minutes.

---

## Real fsaverage5 mesh

The WebGL viewer ships with a level-5 icosphere placeholder mesh. To replace it with the real fsaverage5 cortical surface:

```bash
pip install nilearn nibabel
python scripts/load_atlases.py
```

This downloads the fsaverage5 surface from nilearn, converts it to the binary mesh format expected by the viewer, and writes the files to `packages/atlas-assets/fsaverage5/`. The viewer picks them up automatically on next page load.

---

## Architecture

```
Browser
  └─► Frontend (React + Vite, served by Nginx :3000)
         └─► API (FastAPI :8000)
                ├─► Postgres   — metadata, jobs, audit_logs
                └─► MinIO      — uploads, tensors, ROI traces, exports

Worker (Python, polls jobs table)
  └─► TribeAdapter (mock | real)
  └─► AtlasAdapter  (ROI aggregation)
  └─► StorageAdapter (MinIO | filesystem)
```

```
virtual-subject/
  apps/
    api/tests/          # API + smoke tests
    frontend/           # React + Vite source
    worker/tests/       # Worker + atlas + storage tests
  alembic/              # Database migrations
  infra/
    compose.yaml        # All services
    docker/             # Dockerfiles (api, worker, frontend)
  packages/
    atlas-assets/       # fsaverage5 mesh + ROI index
    test-fixtures/
  scripts/
    bootstrap.sh        # One-shot dev env setup
    load_atlases.py     # Download / generate real fsaverage5
    backfill_checksums.py
    smoke_test.py       # End-to-end test against live API
  src/virtual_subject/
    adapters/           # tribe.py, atlas.py, storage.py
    api/                # routers, schemas
    db/                 # ORM models, migrations bootstrap
    domain/             # constants, utilities
    services/           # app_service.py — all business logic
    worker/             # worker.py — job loop
  .env.example
  Makefile
  pyproject.toml
```

---

## Docker Compose services

| Service | Image | Port | Role |
|---------|-------|------|------|
| `postgres` | postgres:17-alpine | 5432 | Metadata + job queue |
| `minio` | minio/minio | 9000 / 9001 | Object storage |
| `minio-init` | minio/mc | — | Bucket initialization |
| `api` | custom (python:3.11) | 8000 | FastAPI REST API |
| `worker` | custom (python:3.11) | — | Background job processor |
| `frontend` | custom (node:22 → nginx:1.27) | 3000 | Static frontend |

---

## MinIO bucket layout

```
virtual-subject/
  projects/{project_id}/
    stimuli/{stimulus_id}/
      source.{ext}              original upload
      events.json               TRIBE events dataframe
    runs/{run_id}/
      {ablation}/
        prediction.npy          (T × V) float32 tensor
        roi_traces.json         {roi_id → [T values]}
        preview.png             static cortical map
    exports/{export_id}/
      manifest.json             provenance record
      bundle.zip                full export package
    contrasts/{contrast_id}/
      contrast.npy              (V,) vertex-level difference
```

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql+psycopg://…` | Postgres DSN |
| `STORAGE_BACKEND` | `minio` | `minio` or `filesystem` |
| `MINIO_ENDPOINT` | `minio:9000` | MinIO host:port |
| `MINIO_ACCESS_KEY` | `minioadmin` | MinIO auth |
| `MINIO_SECRET_KEY` | `minioadmin` | MinIO auth |
| `MINIO_BUCKET` | `virtual-subject` | Bucket name |
| `TRIBE_MODE` | `mock` | `mock` or `real` |
| `TRIBE_MODEL_ID` | `facebook/tribev2` | Upstream model ID |
| `TRIBE_CACHE_DIR` | `.cache/tribe` | Local model weight cache |
| `TRIBE_DEVICE` | `auto` | `cuda` / `cpu` / `auto` |
| `FRONTEND_ORIGINS` | `http://localhost:3000,…` | CORS allowlist |
| `WORKER_POLL_SECONDS` | `2` | Job claim interval |
| `APP_GIT_COMMIT` | `unknown` | Injected at build for provenance |

Full list with defaults in `.env.example`.

---

## API surface

Base path: `/api/v1`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | API status |
| GET | `/health/db` | Postgres connectivity |
| GET | `/health/storage` | MinIO connectivity |
| GET | `/health/worker` | Worker heartbeat + mode |
| GET | `/stimuli` | List stimuli |
| POST | `/stimuli` | Create file upload session |
| PUT | `/stimuli/{id}/content` | Upload file |
| POST | `/stimuli/{id}/finalize` | Finalize upload |
| POST | `/stimuli/text` | Create text stimulus |
| GET | `/stimuli/{id}` | Stimulus detail |
| GET | `/runs` | List runs |
| POST | `/runs` | Create run (queues job) |
| GET | `/runs/{id}` | Run detail + ablations |
| GET | `/runs/{id}/artifacts` | Artifact registry |
| GET | `/runs/{id}/timeline` | Global signal curve |
| GET | `/runs/{id}/frames/{t}` | Frame at time index |
| GET | `/runs/{id}/frames/{t}/vertices` | Binary float32 vertex stream |
| POST | `/analysis/roi-traces` | ROI time series |
| GET | `/analysis/top-rois` | Top-N ROIs by peak |
| POST | `/analysis/contrast` | Compute vertex-level contrast |
| GET | `/analysis/contrast/{id}` | Contrast metadata |
| GET | `/analysis/contrast/{id}/download` | Binary `.npy` download |
| GET | `/atlases` | List atlases |
| GET | `/atlases/{id}/rois` | ROI metadata |
| GET | `/atlases/fsaverage5/metadata` | Mesh metadata |
| GET | `/atlases/fsaverage5/mesh/{hemi}/{file}` | Binary mesh file |
| GET | `/exports` | List exports |
| POST | `/exports` | Queue export job |
| GET | `/exports/{id}` | Export status |
| GET | `/exports/{id}/download` | Download `.zip` bundle |

---

## Developer commands (Makefile)

```bash
make up        # docker compose up --build
make test      # pytest (mock mode, no GPU)
make lint      # ruff check + format
make migrate   # alembic upgrade head
make smoke     # scripts/smoke_test.py against live API
```

Local dev without Docker:

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -e .[dev]
.venv/Scripts/python -m pytest
```

---

## Frontend

The frontend is a React + Vite single-page app served by Nginx, using Oat (vendored at `0.5.0`) for all UI styling. Four runtime dependencies only: `react`, `react-dom`, `vite`, `@vitejs/plugin-react`. No state management library, no router library — hash routing is a 20-line custom hook.

Pages:
- **Home** — live pipeline dashboard with step-by-step status and contextual CTA
- **1 · Stimuli** — text paste, file upload, run queue
- **2 · Runs** — 3-D cortical viewer, ablation switcher, ROI traces
- **3 · Compare** — two-run contrast table
- **4 · Export** — export queue and download history

---

## TRIBE integration

`src/virtual_subject/adapters/tribe.py` contains two adapters behind a common interface:

**`MockTribeAdapter`** — deterministic seeded sine/cosine vertex predictions. Used by default. Lets the entire pipeline run in CI or on a laptop without GPU or weights.

**`RealTribeAdapter`** — wraps the upstream TRIBE v2 inference API:
```python
TribeModel.from_pretrained("facebook/tribev2", cache_folder=...)
model.get_events_dataframe(video_path=... | audio_path=... | text_path=...)
model.predict(events=df)
```

Only the adapter ever imports from `tribev2`. The rest of the codebase is isolated from upstream internals.

---

## Reproducibility

Every export `manifest.json` captures:

- `model_id` — `facebook/tribev2`
- `app_git_commit` — injected at Docker build time
- `tribe_upstream_version` — from config
- `weights_source` — `huggingface:facebook/tribev2`
- `atlas_id`, `normalization`, `subject_mode`
- `input_hash` — sha256 of the stimulus content
- `created_at` timestamp
- Full run config and ablation list

---

## Minimal dependency philosophy

| Decision | Rationale |
|----------|-----------|
| No Redis | Job queue uses a Postgres `jobs` table with `claimed_at` locking; one worker is enough for MVP |
| No React Router / Zustand | Custom 20-line hash hook + React built-in state; URL params carry viewer state |
| No charting library | SVG sparklines hand-rolled in `LineChart.jsx` |
| No cloud SDK | MinIO provides an S3-compatible API; `minio` client is the only object-storage dependency |
| No TypeScript | Plain JSX keeps the frontend zero-config |
| No HCP Glasser atlas in-repo | Requires a ConnectomeDB registration; `load_atlases.py` handles the download |

---

## License

Application code: MIT (this repo).
Upstream TRIBE v2 model and weights: **CC BY-NC 4.0** — non-commercial research use only.
