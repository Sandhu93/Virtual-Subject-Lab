# virtual-subject

`virtual-subject` is a lab-focused MVP around TRIBE v2 for teaching and hypothesis testing. It ingests text, audio, or video stimuli, runs pretrained TRIBE-style inference through a worker, stores reproducible artifacts in MinIO, and serves a research-oriented web UI from FastAPI templates with Oat-based styling.

This repo intentionally stays small:

- FastAPI for the API and server-rendered UI
- vanilla JavaScript for progressive enhancement
- one polling Python worker
- Postgres for metadata and queue state
- MinIO for artifacts
- Docker Compose for orchestration

The app defaults to the average unseen subject framing and cortical outputs only. It does not claim thought reading, diagnosis, neuron-level activity, or real-time cognition.

## Status

This scaffold commit establishes the monorepo layout, pinned dependencies, Docker Compose baseline, API and worker entrypoints, and the first README/TODO pass. The next milestones fill in the metadata model, job pipeline, mock adapter, real adapter boundary, UI pages, exports, and tests.

## Source grounding

Primary product spec:

- `what_app_should_do.txt`
- `implementation_blueprint.txt`
- `research_paper.pdf`

Upstream model dependency and inference contract:

- TRIBE v2 repo: `TribeModel.from_pretrained("facebook/tribev2", ...)`
- `model.get_events_dataframe(video_path=..., audio_path=..., text_path=...)`
- `model.predict(events=df)`

Scientific facts pulled into the architecture:

- predictions are for an average unseen subject
- cortical outputs live on fsaverage5 with roughly 20,484 vertices
- outputs are resampled to 1 Hz
- interpretation should respect the roughly 5-second hemodynamic delay
- modality dropout is a trained property, so ablations are first-class

Oat UI decision:

- pin to `v0.5.1`
- vendor exact assets locally in a later milestone to avoid breakage from the library's sub-v1 status
- keep the UI framework-free

## Planned repo tree

```text
virtual-subject/
  apps/
    api/
      tests/
    worker/
      tests/
  packages/
    atlas-assets/
    test-fixtures/
  infra/
    compose.yaml
    docker/
      api.Dockerfile
      worker.Dockerfile
  scripts/
  alembic/
    versions/
  src/
    virtual_subject/
      api/
        routers/
        schemas/
        main.py
      worker/
        main.py
      db/
      services/
      adapters/
      domain/
      web/
        templates/
        static/
  .env.example
  Makefile
  pyproject.toml
  README.md
  TODO.md
```

## Dependencies and justification

- `fastapi`: REST API plus server-rendered HTML.
- `uvicorn[standard]`: ASGI server for local and container runtime.
- `jinja2`: HTML templates without a frontend framework.
- `sqlalchemy`: metadata models and a simple Postgres-backed queue.
- `alembic`: repeatable schema migrations.
- `psycopg[binary]`: Postgres driver with low setup friction in Docker.
- `minio`: S3-compatible storage client for MinIO.
- `pydantic` and `pydantic-settings`: request schemas and environment config.
- `python-multipart`: direct browser uploads to the API.
- `numpy`: prediction arrays and export artifacts.
- `pandas`: TRIBE events dataframe compatibility.
- `pillow`: lightweight preview PNG generation.
- `pytest`, `httpx`, `pytest-cov`, `ruff`: tests and linting only.
- `tribev2` as an optional extra: keep the scaffold runnable in mock mode when weights or GPU access are unavailable.

## Architecture

```text
browser
  -> FastAPI app
     -> Postgres (metadata, queue, status)
     -> MinIO (uploads, events, predictions, previews, exports)

worker
  -> polls Postgres jobs table
  -> loads one adapter instance
  -> writes artifacts to MinIO
```

## Quickstart

1. Copy `.env.example` to `.env`.
2. Run `docker compose -f infra/compose.yaml up --build`.
3. Open `http://localhost:8000`.

The scaffold currently exposes:

- `/`
- `/api/v1/health`
- `/api/v1/health/db`
- `/api/v1/health/storage`
- `/api/v1/health/worker`

## Scientific caveats

- Research use only.
- Average subject, not a personalized subject.
- Predicted BOLD-like fMRI response, not neuronal firing.
- Hemodynamic delay matters for interpretation.
- Upstream TRIBE v2 is released under CC BY-NC 4.0.

