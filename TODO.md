# TODO

This file tracks what is done, what is pending, and what is deliberately out of scope.
Items are grouped by phase matching the implementation blueprint's delivery plan.

---

## Phase 0 — Core MVP (DONE)

### Infrastructure
- [x] Repo skeleton, Docker Compose stack (postgres, minio, minio-init, api, worker, frontend)
- [x] Alembic migrations; tables created at startup as fallback
- [x] `.env.example` with all variables documented
- [x] `Makefile` with `up`, `test`, `lint`, `migrate`, `smoke` targets
- [x] Health endpoints: `/health`, `/health/db`, `/health/storage`, `/health/worker`
- [x] Worker heartbeat table (`worker_heartbeats`)
- [x] Audit logging (`audit_logs` table, actions on run create/complete)

### Backend — stimuli
- [x] `POST /stimuli` — create file upload session (returns `upload_url`, `finalize_url`)
- [x] `PUT /stimuli/{id}/content` — direct file upload
- [x] `POST /stimuli/{id}/finalize` — compute checksum, detect duration, mark ready
- [x] `POST /stimuli/text` — text shortcut, immediate `ready` status
- [x] `GET /stimuli`, `GET /stimuli/{id}` — list and detail with transcript fields
- [x] Transcript and `word_timing_status` surfaced in API and frontend table
- [x] Content-hash deduplication on finalize (reuses existing stimulus record)

### Backend — runs
- [x] `POST /runs` — create run with ablation list; hash-based cache reuse
- [x] `GET /runs`, `GET /runs/{id}` — list and detail with ablations sub-array
- [x] `GET /runs/{id}/timeline` — global signal curve, `n_timesteps`, `sample_rate_hz`
- [x] `GET /runs/{id}/frames/{t}` — frame metadata + `vertices_url`
- [x] `GET /runs/{id}/frames/{t}/vertices` — binary little-endian float32 vertex stream
- [x] `GET /runs/{id}/artifacts` — artifact registry for a run

### Backend — analysis
- [x] `POST /analysis/roi-traces` — per-ROI mean traces for requested `roi_ids`
- [x] `GET /analysis/top-rois` — top-N ROIs ranked by peak response
- [x] `POST /analysis/contrast` — vertex-level mean difference (run_a − run_b)
- [x] `GET /analysis/contrast/{id}` — contrast metadata
- [x] `GET /analysis/contrast/{id}/download` — binary `.npy` download

### Backend — exports
- [x] `POST /exports` — queue export job
- [x] `GET /exports`, `GET /exports/{id}` — list and detail
- [x] `GET /exports/{id}/download` — `.zip` bundle download
- [x] Export manifest with full provenance (model ID, commit SHA, input hash, atlas version, timestamps)
- [x] Bundle contents: `manifest.json`, `{ablation}/prediction.npy`, `{ablation}/roi_traces.json`, `{ablation}/preview.png`

### Backend — atlas
- [x] `GET /atlases` — list available atlases
- [x] `GET /atlases/{id}/rois` — ROI metadata
- [x] `GET /atlases/fsaverage5/metadata` — mesh metadata JSON
- [x] `GET /atlases/fsaverage5/mesh/{hemi}/{file}` — binary mesh file serving
- [x] `GET /atlases/lab_roi_pack_v1/roi_index` — curated ROI index
- [x] 14-ROI curated pack: early visual, ventral visual, dorsal visual, MT/motion, early auditory, auditory association, STS/language, inferior frontal, TPJ, default mode, FFA, PPA, EBA, VWFA

### Worker
- [x] Postgres-backed job queue (no Redis); `jobs` table with `claimed_at` row-locking
- [x] Single polling worker loop (`WORKER_POLL_SECONDS`)
- [x] `run_prediction` job: preprocess → predict all ablations → ROI aggregation → preview PNG → mark succeeded
- [x] `export_bundle` job: build ZIP with manifest + artifacts
- [x] Back-fill `transcript_text` in `stimulus_metadata` after events build
- [x] ROI laterality indices computed and stored in `roi_summaries`

### Adapters
- [x] `MockTribeAdapter` — deterministic seeded sine/cosine (T × V) predictions; no GPU or weights required
- [x] `RealTribeAdapter` — wraps `TribeModel.from_pretrained`, `get_events_dataframe`, `predict`; clean `ImportError` with remediation text if `tribev2` not installed
- [x] `StorageAdapter` — abstract interface; `MinioStorageAdapter` (default) + `FileStorageAdapter` (dev)
- [x] `LabAtlas` — ROI aggregation, frame extraction, top-ROI ranking
- [x] `TRIBE_MODE=mock|real` config switch

### Frontend (original vanilla JS → React migration)
- [x] Migrated to React 19 + Vite 6 (4 packages total)
- [x] Custom hash router (20-line hook, no react-router)
- [x] Oat 0.5.0 vendored under `static/assets/vendor/oat/`
- [x] **Home** — live pipeline dashboard: 4-step stepper with real counts + contextual next-step CTA
- [x] **Stimuli** — text paste, file upload, run queue with step-based UX
- [x] **Runs** — 3-D cortical viewer, sidebar controls, ROI traces, shareable URL hash state
- [x] **Compare** — two-run contrast with ROI delta table (signed, colour-coded)
- [x] **Export** — queue + download history with StatusBadge
- [x] WebGL cortical surface viewer (`viewer.js`) — orbit camera, hot colormap, play/pause, snapshot
- [x] `StatusBadge` component — colour-coded pills for queued/processing/succeeded/failed/ready
- [x] `LineChart` component — hand-rolled SVG sparkline
- [x] `BrainCanvas` component — `forwardRef` + `useImperativeHandle` wrapper for imperative WebGL API
- [x] Run workspace: live polling every 3 s until succeeded; ablation switcher; live-value slider labels
- [x] Nav numbered steps: "1 · Stimuli → 2 · Runs → 3 · Compare → 4 · Export"

### Scripts
- [x] `scripts/bootstrap.sh` — one-shot dev env setup
- [x] `scripts/load_atlases.py` — download real fsaverage5 or generate icosphere fallback
- [x] `scripts/backfill_checksums.py` — recompute missing checksums
- [x] `scripts/smoke_test.py` — full end-to-end test against live API

### Tests
- [x] `test_health.py` — API health endpoints
- [x] `test_smoke.py` — full pipeline in mock mode
- [x] `test_workflow.py` — multi-ablation, timeline, frame, top-ROI
- [x] `test_mock_pipeline.py` — worker job processing end-to-end
- [x] `test_atlas_and_storage.py` — ROI aggregation + storage I/O
- [x] `test_settings.py` — configuration validation

---

## Phase 1 — Viewer and ROI analysis depth (PENDING)

These are specified in the MVP feature set but not yet fully implemented in the frontend.

### Cortical viewer
- [ ] **Real fsaverage5 mesh** — currently an icosphere placeholder; run `python scripts/load_atlases.py` and wire the real binary mesh into the viewer auto-load path
- [ ] **Parcel boundary overlay** — draw parcel/ROI boundary edges on the surface in the WebGL viewer (the toggle exists in UI but has no effect yet)
- [ ] **Hot-spot picker** — click a vertex on the 3-D surface → identify nearest ROI label and show its trace automatically; requires reverse vertex→ROI lookup in `viewer.js`

### ROI analysis panel
- [ ] **Multi-ROI trace comparison** — currently only one ROI trace is shown at a time; add ability to overlay 2–4 ROI traces on the same sparkline for direct visual comparison
- [ ] **Area-under-curve (AUC)** — already computed in `roi_summaries` DB table; surface it in the run workspace ROI panel alongside peak and latency
- [ ] **Laterality index** — already in `roi_summaries`; display it per ROI (positive = left-dominant, negative = right-dominant)
- [ ] **Peak latency** — already returned by `top-rois` API; show it in the top-ROI list alongside peak value

### Run workspace UX
- [ ] **Stimulus summary card** — show the source stimulus name, type, duration, and transcript snippet in the run sidebar so the user knows what they are looking at
- [ ] **Atlas selector** — currently hardcoded to `lab_curated_v1`; add a dropdown to switch atlases when more are available
- [ ] **Normalization badge** — show the normalization mode (`segment_p99` / `zscore` / `none`) in the workspace so it is visible in screenshots
- [ ] **Sample rate + vertex count display** — add footer info bar: `1 Hz · 20,484 vertices · average subject`
- [ ] **Run progress steps** — the `/runs/{id}` response shape includes ablation sub-statuses; show a per-step progress indicator (preprocess → predict → ROI summary → export) while the run is processing instead of just a generic spinner

### Compare page
- [ ] **ROI response mode** — a second compare tab that ranks ROIs by the magnitude of their between-run difference, not just the vertex-level contrast map
- [ ] **Ablation delta mode** — a third compare tab that shows one run's response delta across ablation conditions (full vs text_only, etc.) rather than run A vs run B

---

## Phase 2 — Atlas and data improvements (PENDING)

### HCP Glasser atlas
- [ ] **HCP Glasser 360-parcel atlas** — requires ConnectomeDB registration to download `HCP_MMP1.0_ANNOT` files; add as a second atlas option after legal/license review
- [ ] **Glasser parcel lookup** — map Glasser parcel IDs to the curated ROI groups so the full 360-parcel view coexists with the 14-ROI summary

### Batch compare
- [ ] **Multi-stimulus batch upload** — queue multiple stimuli in one step and run the same ablation set across all of them; return a ranked table by target ROI response
- [ ] **Batch contrast map** — compute condition A vs condition B across a set of runs (e.g., all "speech" clips vs all "music" clips); display aggregate vertex-level z-score map
- [ ] **Export CSV from compare page** — download the ROI contrast table as `.csv` from the Compare page directly

### Export improvements
- [ ] **Screenshots in bundle** — the export job already generates `preview.png`; add timestep-selected screenshots (e.g., at peak activation per ablation) to the bundle
- [ ] **Events dataframe in bundle** — include the `events.json` (TRIBE events dataframe) in the export ZIP for full stimulus→prediction traceability
- [ ] **Run config JSON** — add a standalone `run_config.json` to the bundle alongside `manifest.json` with just the inference parameters

### Data model
- [ ] **`DELETE /runs/{id}`** — endpoint specified in blueprint, not yet implemented; should cascade-delete artifacts and ablations
- [ ] **`GET /runs/{id}/artifacts`** — currently returns raw storage keys; add signed download URLs with short expiry for direct browser download
- [ ] **Stimulus metadata in API** — expose `events_key`, `transcript_uri`, `waveform_uri` from `stimulus_metadata` table in the `/stimuli/{id}` response

---

## Phase 3 — Advanced features (FUTURE)

These are explicitly out of scope for V1 per the original spec. Tracked here for planning.

### Authentication
- [ ] **JWT-based login** — currently the app creates a single default user at startup; add a login page and API token flow for multi-user lab use
- [ ] **Project isolation** — stimuli and runs are already scoped to `project_id` in the DB; enforce project access control once auth is in place
- [ ] **Role-based access** — admin (can delete), researcher (read-write), viewer (read-only)

### Subject-specific fine-tuning
- [ ] **Fine-tuning UI** — upload subject-specific fMRI data, trigger one-epoch fine-tuning on the TRIBE model, switch workspace to "lab-tuned" subject mode
- [ ] **Subject mode switcher** — `average` (default) / `lab-tuned` / `custom cohort` tabs in the run workspace header
- [ ] **Fine-tuning results comparison** — side-by-side view of average vs fine-tuned predictions for the same stimulus

### Subcortical outputs
- [ ] **Subcortical prediction target** — the blueprint defines `prediction_target: cortical | subcortical | both`; add subcortical when TRIBE exposes it
- [ ] **Subcortical viewer panel** — add a flat 2-D schematic of subcortical structures (basal ganglia, thalamus, hippocampus) coloured by predicted activation

### Annotations and workspaces
- [ ] **User annotations** — free-text notes attached to a run, stored in `runs.metadata_json`; displayed in the workspace sidebar
- [ ] **Saved workspaces** — persist the exact viewer state (ablation, threshold, ROI selection, timepoint) as a named workspace that can be restored or shared via link
- [ ] **Annotation rail** — a contextual explanation strip in the UI that explains what the user is looking at: "hemodynamic delay", "average subject", "BOLD-like timeseries" — visible near the viewer

### Infrastructure
- [ ] **Real-time streaming inference** — stream partial predictions back to the browser as the worker completes each second; requires WebSocket or SSE endpoint (explicitly deferred for V1)
- [ ] **Redis job queue** — replace the Postgres polling queue with Redis for lower-latency job dispatch when throughput requires it
- [ ] **Multi-GPU worker** — parallelize ablation predictions across GPUs; update worker to claim and process ablations independently rather than sequentially
- [ ] **Kubernetes / Helm charts** — production deployment manifests (explicitly out of scope for Docker Compose MVP)

---

## Out of scope (V1 non-goals — do not build)

Per the spec, these are explicitly excluded from V1:

- Subject-specific fine-tuning UI
- Real-time streaming inference
- Clinical interpretation layer
- Group statistics dashboard
- Automated manuscript writer
- Mobile app
- Cloud-specific deployment (AWS, GCP, Azure SDKs)
- Multi-user RBAC
- Manuscript / figure generation

---

## Implementation order for Phase 1

If picking up Phase 1 work, this is the suggested order by impact:

1. **Real fsaverage5 mesh** — highest visual impact; run `load_atlases.py` and auto-serve the real surface
2. **Hot-spot picker** — makes the viewer interactive and scientifically useful
3. **Parcel boundary overlay** — completes the existing toggle UI
4. **Multi-ROI trace comparison** — high analytical value; the data is already in the API
5. **AUC + laterality display** — data already computed; just needs UI surfacing
6. **Stimulus summary card** — small but improves workspace context
7. **Run progress steps** — improves perceived responsiveness during long runs
8. **Ablation delta compare tab** — expands Compare page utility
