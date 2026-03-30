# virtual-subject

`virtual-subject` is a research-grade MVP around TRIBE v2 for lab teaching and hypothesis testing. It lets a researcher ingest text, audio, or video stimuli, queue pretrained inference in a background worker, inspect cortical ROI activity over time, compare modality ablations, and export reproducible artifacts.

The app is intentionally small:

- FastAPI for both REST and server-rendered HTML
- vanilla JavaScript for progressive enhancement
- one polling Python worker
- Postgres for metadata and queue state
- MinIO for artifacts
- Docker Compose for orchestration

The UI keeps the paper’s caveats visible: average unseen subject only, predicted BOLD-like fMRI response, research use only, and no clinical or neuron-level claims.

## What works now

- text stimulus creation
- file stimulus create/upload/finalize flow
- queued run creation with hash-based cache reuse
- deterministic mock TRIBE adapter
- worker-driven run processing
- timeline, frame, ROI trace, and top-ROI APIs
- compare endpoint for two runs
- export bundle generation and download endpoint
- server-rendered pages for stimuli, run workspace, compare, exports, and about
- Docker Compose definition for API, worker, Postgres, MinIO, and bucket init
- Alembic baseline migration
- test suite covering API flow, atlas/storage, mock pipeline, and smoke path

## Source grounding

Primary product spec:

- `what_app_should_do.txt`
- `implementation_blueprint.txt`
- `research_paper.pdf`

Upstream TRIBE integration contract:

- `TribeModel.from_pretrained("facebook/tribev2", ...)`
- `model.get_events_dataframe(video_path=..., audio_path=..., text_path=...)`
- `model.predict(events=df)`

Scientific constraints pulled into the app:

- average unseen subject is the default and only V1 subject mode
- cortical predictions are primary
- outputs are interpreted as hemodynamically delayed BOLD-like signals
- modality dropout makes ablations scientifically meaningful
- fsaverage5 cortical outputs imply a vertex-by-time prediction artifact, even if the current viewer surfaces ROI summaries first

## Minimal dependency philosophy

- No React, Next.js, or frontend state framework.
- No Redis. Queueing uses a Postgres `jobs` table and one worker process.
- No cloud SDK dependency. Storage is S3-compatible through MinIO only.
- No heavyweight plotting or charting library. The viewer uses hand-rolled SVG and lightweight PNG previews.
- The real TRIBE dependency is not installed by default. Mock mode keeps the stack runnable without GPU, weights, or upstream package setup.

## Architecture

```text
browser
  -> FastAPI app
     -> Postgres
        - users, projects, stimuli, runs, run_ablations
        - roi_summaries, exports, artifacts, audit_logs, jobs
     -> MinIO
        - uploaded media
        - events JSON
        - prediction .npy
        - ROI traces JSON
        - preview .png
        - export .zip

worker
  -> polls jobs table
  -> loads one adapter instance
  -> writes artifacts and summaries
```

Repo tree:

```text
virtual-subject/
  apps/
    api/tests/
    worker/tests/
  alembic/
    env.py
    versions/
  infra/
    compose.yaml
    docker/
  packages/
    atlas-assets/
    test-fixtures/
  src/virtual_subject/
    adapters/
    api/
    db/
    domain/
    services/
    web/
    worker/
  .env.example
  Makefile
  pyproject.toml
  README.md
  TODO.md
```

## Dependencies and justification

- `fastapi`: REST API plus server-rendered HTML.
- `uvicorn[standard]`: ASGI runtime.
- `jinja2`: HTML templates without a frontend framework.
- `sqlalchemy`: ORM and lightweight queue persistence.
- `alembic`: repeatable schema migrations.
- `psycopg[binary]`: Postgres driver for Docker runtime.
- `minio`: S3-compatible artifact storage client.
- `pydantic`, `pydantic-settings`: schemas and environment config.
- `python-multipart`: direct upload handling.
- `numpy`: prediction arrays and export artifacts.
- `pandas`: TRIBE events dataframe compatibility.
- `pillow`: preview PNG generation.
- `pytest`, `httpx`, `pytest-cov`, `ruff`: development only.

## UI layer

The UI is framework-free and references Oat pinned to `0.5.0` from the published package path:

- `https://cdn.jsdelivr.net/npm/@knadh/oat@0.5.0/dist/oat.min.css`

The current code still keeps local custom CSS for layout and research-specific affordances. Vendoring the exact Oat assets is the next cleanup step.

## TRIBE integration

`src/virtual_subject/adapters/tribe.py` defines two adapters:

- `MockTribeAdapter`: deterministic vertex-by-time tensors for CI, smoke tests, and no-GPU laptops.
- `RealTribeAdapter`: lazy import path around the upstream API. It writes text stimuli to a temp file when needed and filters the events dataframe for modality ablations when the `type` column is available.

The rest of the app only speaks to the adapter boundary, not directly to `tribev2`.

## Mock mode

Mock mode is the default:

```bash
cp .env.example .env
docker compose -f infra/compose.yaml up --build
```

Or locally in the repo venv:

```bash
python -m venv .venv
.venv\Scripts\python -m pip install -e .[dev]
.venv\Scripts\python -m pytest
```

## Real model mode

Real mode requires the upstream `tribev2` package and model access. The project deliberately does not pin an unverified package artifact in `pyproject.toml`; install the upstream dependency explicitly, then switch:

```bash
set TRIBE_MODE=real
set TRIBE_MODEL_ID=facebook/tribev2
```

Expected upstream flow:

- `TribeModel.from_pretrained("facebook/tribev2", ...)`
- `model.get_events_dataframe(...)`
- `model.predict(events=df)`

When MinIO is the storage backend, the worker stages media into a temp file before calling the real adapter.

## Docker Compose quickstart

Services:

- `api`
- `worker`
- `postgres`
- `minio`
- `minio-init`

Commands:

```bash
docker compose -f infra/compose.yaml config
docker compose -f infra/compose.yaml up --build
```

Note: in this environment the compose file validates, but end-to-end `docker compose up` could not be executed because the local Docker daemon was unavailable.

## MinIO bucket layout

Artifact keys follow stable paths:

- `projects/{project_id}/stimuli/{stimulus_id}/source.*`
- `projects/{project_id}/stimuli/{stimulus_id}/events.json`
- `projects/{project_id}/runs/{run_id}/{ablation}/prediction.npy`
- `projects/{project_id}/runs/{run_id}/{ablation}/roi_traces.json`
- `projects/{project_id}/runs/{run_id}/{ablation}/preview.png`
- `projects/{project_id}/exports/{export_id}/manifest.json`
- `projects/{project_id}/exports/{export_id}/bundle.zip`

## Environment variables

Core:

- `DATABASE_URL`
- `STORAGE_BACKEND`
- `MINIO_ENDPOINT`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `MINIO_BUCKET`

TRIBE:

- `TRIBE_MODE`
- `TRIBE_MODEL_ID`
- `TRIBE_CACHE_DIR`
- `TRIBE_DEVICE`
- `TRIBE_UPSTREAM_VERSION`
- `TRIBE_WEIGHTS_SOURCE`

App:

- `APP_ENV`
- `APP_HOST`
- `APP_PORT`
- `WORKER_POLL_SECONDS`
- `OAT_VERSION`
- `APP_GIT_COMMIT`

Defaults live in `.env.example`.

## API surface

REST base path: `/api/v1`

Implemented routes include:

- `/health`, `/health/db`, `/health/storage`, `/health/worker`
- `/stimuli`, `/stimuli/{id}`, `/stimuli/{id}/content`, `/stimuli/{id}/finalize`, `/stimuli/text`
- `/runs`, `/runs/{id}`, `/runs/{id}/timeline`, `/runs/{id}/frames/{time_index}`, `/runs/{id}/artifacts`
- `/analysis/roi-traces`, `/analysis/top-rois`, `/analysis/compare`
- `/atlases`
- `/exports`, `/exports/{id}`, `/exports/{id}/download`

## Tests and developer commands

- `make test`
- `make lint`
- `make migrate`
- `make smoke`
- `make up`

Current test status:

- `8 passed` on the local mock-mode suite

## Known limitations

- The current viewer surfaces ROI-level cortical summaries, not a full fsaverage5 mesh renderer.
- The bundled atlas is a curated lab ROI pack with deterministic vertex partitions, not yet a real Glasser/fsaverage5 asset drop.
- The app creates tables at startup for convenience and also ships Alembic; a dedicated `db-migrate` compose service is still optional future cleanup.
- Oat is pinned but not yet vendored locally.

## Scientific and license caveats

- Average subject predictions only.
- Predicted BOLD-like fMRI response, not neuronal firing.
- Research use only.
- No diagnosis, mind reading, or clinical interpretation.
- Upstream TRIBE v2 is released under CC BY-NC 4.0, so commercialization needs a separate legal path.
