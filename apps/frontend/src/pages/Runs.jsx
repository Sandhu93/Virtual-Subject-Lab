import { useEffect, useRef, useState } from "react";
import { apiFetch, API_BASE } from "../api";
import BrainCanvas from "../components/BrainCanvas";
import LineChart from "../components/LineChart";
import StatusBadge from "../components/StatusBadge";

const ATLAS_ID = "lab_curated_v1";
const ALL_ABLATIONS = [
  "full", "text_only", "audio_only", "video_only",
  "text_audio", "text_video", "audio_video",
];

function Feedback({ msg }) {
  if (!msg) return null;
  const isError = msg.startsWith("Error:");
  return (
    <div className={`alert ${isError ? "alert--error" : "alert--neutral"}`} style={{ marginTop: ".75rem" }}>
      {msg}
    </div>
  );
}

export default function Runs({ params }) {
  const runId = params.get("id") || "";

  const [runs, setRuns] = useState([]);
  const [run, setRun] = useState(null);
  const [roiMeta, setRoiMeta] = useState([]);
  const [loading, setLoading] = useState(false);

  const [ablation, setAblation] = useState(() => params.get("ablation") || "full");
  const [threshold, setThreshold] = useState(() => Number(params.get("threshold")) || 0.25);
  const [timeIndex, setTimeIndex] = useState(() => Number(params.get("time")) || 0);
  const [hemisphere, setHemisphere] = useState(() => params.get("hemisphere") || "both");
  const [parcelOverlay, setParcelOverlay] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);

  const [nTimesteps, setNTimesteps] = useState(0);
  const [timeline, setTimeline] = useState(null);
  const [topRois, setTopRois] = useState([]);
  const [frameRois, setFrameRois] = useState([]);
  const [frameEvents, setFrameEvents] = useState([]);
  const [roiId, setRoiId] = useState("");
  const [roiTrace, setRoiTrace] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [stimulus, setStimulus] = useState(null);

  const viewerRef = useRef(null);

  useEffect(() => {
    apiFetch("/runs").then(setRuns).catch(() => {});
    apiFetch(`/atlases/${ATLAS_ID}/rois`)
      .then((d) => {
        const items = d.items || [];
        setRoiMeta(items);
        if (items.length) setRoiId(items[0].roi_id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    let pollTimer = null;
    setLoading(true);
    setFeedback("");

    async function load() {
      const r = await apiFetch(`/runs/${runId}`);
      if (cancelled) return;
      setRun(r);

      if (r.status !== "succeeded") {
        setLoading(false);
        return;
      }

      clearInterval(pollTimer);
      pollTimer = null;

      const tl = await apiFetch(
        `/runs/${runId}/timeline?ablation=${encodeURIComponent(ablation)}`
      );
      if (cancelled) return;
      setTimeline(tl);
      setNTimesteps(tl.n_timesteps);
      setLoading(false);

      if (r.stimulus_id) {
        apiFetch(`/stimuli/${r.stimulus_id}`)
          .then((s) => {
            if (!cancelled) setStimulus(s);
          })
          .catch(() => {});
      }

      const v = viewerRef.current;
      if (v) {
        v.setRunConfig(runId, ablation, tl.n_timesteps, API_BASE);
        v.setThreshold(threshold);
        v.setHemisphere(hemisphere);
        v.setParcelOverlay(parcelOverlay);
        v.setTimeIndex(timeIndex);
      }

      const frame = await apiFetch(
        `/runs/${runId}/frames/${timeIndex}?ablation=${encodeURIComponent(ablation)}`
      );
      if (cancelled) return;
      setFrameRois(frame.roi_frame || []);

      const eventPayload = await apiFetch(
        `/runs/${runId}/events?ablation=${encodeURIComponent(ablation)}`
      ).catch(() => ({ items: [] }));
      if (cancelled) return;
      setFrameEvents(eventPayload.items || []);

      const top = await apiFetch(
        `/analysis/top-rois?run_id=${encodeURIComponent(runId)}&ablation=${encodeURIComponent(ablation)}&limit=10`
      );
      if (cancelled) return;
      setTopRois(top.items || []);

      const p = new URLSearchParams({ id: runId, ablation, threshold, hemisphere, time: timeIndex });
      const hash = `#/runs?${p}`;
      if (location.hash !== hash) history.replaceState(null, "", hash);
    }

    load().catch((err) => {
      if (!cancelled) {
        setLoading(false);
        setFeedback(`Error: ${err.message}`);
      }
    });

    pollTimer = setInterval(() => {
      if (!cancelled) load().catch(() => {});
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(pollTimer);
    };
  }, [runId, ablation]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!runId || !roiId || run?.status !== "succeeded") return;
    let cancelled = false;
    apiFetch("/analysis/roi-traces", {
      method: "POST",
      body: JSON.stringify({ run_id: runId, ablation, roi_ids: [roiId] }),
    })
      .then((d) => {
        if (!cancelled) setRoiTrace(d.traces?.[0]?.mean_trace ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [runId, ablation, roiId, run?.status]);

  useEffect(() => {
    if (!runId || run?.status !== "succeeded") return;
    let cancelled = false;
    apiFetch(`/runs/${runId}/frames/${timeIndex}?ablation=${encodeURIComponent(ablation)}`)
      .then((d) => {
        if (!cancelled) setFrameRois(d.roi_frame || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [runId, ablation, timeIndex, run?.status]);

  useEffect(() => {
    viewerRef.current?.setThreshold(threshold);
  }, [threshold]);

  useEffect(() => {
    viewerRef.current?.setHemisphere(hemisphere);
  }, [hemisphere]);

  useEffect(() => {
    viewerRef.current?.setParcelOverlay(parcelOverlay);
  }, [parcelOverlay]);

  const activeNow = [...frameRois]
    .filter((item) => item.value >= threshold)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  const strongestActive = activeNow[0] ?? null;
  const alignedEvent =
    frameEvents.find((item) => timeIndex >= item.start_seconds && timeIndex < item.end_seconds) ||
    frameEvents
      .slice()
      .sort((a, b) => Math.abs(a.start_seconds - timeIndex) - Math.abs(b.start_seconds - timeIndex))[0] ||
    null;

  const alignedEventLabel = (() => {
    if (!alignedEvent) return "No aligned input segment available.";
    const start = alignedEvent.start_seconds.toFixed(1);
    const end = alignedEvent.end_seconds.toFixed(1);
    if (alignedEvent.token) {
      return `"${alignedEvent.token}"`;
    }
    if (alignedEvent.type.toLowerCase() === "video") {
      return `Video segment at ${start}s-${end}s`;
    }
    if (alignedEvent.type.toLowerCase() === "audio") {
      return `Audio segment at ${start}s-${end}s`;
    }
    return `${alignedEvent.type} event at ${start}s-${end}s`;
  })();

  function handleRunChange(e) {
    const id = e.target.value;
    if (!id) return;
    location.hash = `#/runs?id=${encodeURIComponent(id)}&ablation=${ablation}&threshold=${threshold}&hemisphere=${hemisphere}&time=0`;
  }

  function handleSnapshot() {
    const url = viewerRef.current?.snapshot();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `snapshot_${Date.now()}.png`;
    a.click();
  }

  async function handleExport() {
    try {
      await apiFetch("/exports", {
        method: "POST",
        body: JSON.stringify({ run_id: runId }),
      });
      location.hash = "#/exports";
    } catch (err) {
      setFeedback(`Error: ${err.message}`);
    }
  }

  const availableAblations = run?.ablations?.map((a) => a.ablation) || ALL_ABLATIONS;

  if (!runId) {
    return (
      <div className="page-stack">
        <section className="page-intro">
          <div>
            <p className="eyebrow">Run workspace</p>
            <h2 className="page-intro__title">Open a run to inspect cortical activity.</h2>
            <p className="page-intro__desc">
              Pick an existing run below or queue a new one from the Stimuli page.
            </p>
          </div>
        </section>
        <div className="panel grid-shell-single">
          <div className="empty-state">
            <p className="empty-state__title">No run selected</p>
            <p>Go to <a href="#/stimuli">Stimuli</a> to create a stimulus and queue a run, or pick one below.</p>
            {runs.length > 0 && (
              <select
                style={{ maxWidth: 340, margin: "1rem auto 0", display: "block" }}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) location.hash = `#/runs?id=${encodeURIComponent(e.target.value)}`;
                }}
              >
                <option value="">Pick a run</option>
                {runs.map((r) => (
                  <option key={r.run_id} value={r.run_id}>
                    {r.run_id} - {r.status}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="page-stack">
      <section className="page-intro">
        <div>
          <p className="eyebrow">Run workspace</p>
          <h2 className="page-intro__title">Inspect one run at a time.</h2>
          <p className="page-intro__desc">
            The viewer is the primary surface. Controls stay to the left and frame evidence stays to the right.
          </p>
        </div>
        <div className="page-intro__meta">
          <div>
            <span>Run</span>
            <strong>{run?.run_id ?? runId}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{run ? <StatusBadge status={run.status} /> : "Loading"}</strong>
          </div>
          <div>
            <span>Top active ROI</span>
            <strong>{strongestActive ? strongestActive.label : "None above threshold"}</strong>
          </div>
        </div>
      </section>

      <section className="workspace-shell">
        <aside className="panel">
          <p className="panel-kicker">Controls</p>
          {loading && (
            <div className="loading-row" style={{ marginBottom: "1rem" }}>
              <span className="spinner" />
              {run?.status === "queued" || run?.status === "processing"
                ? "Waiting for run to complete..."
                : "Loading workspace..."}
            </div>
          )}

          <div className="stack">
            <label>
              <span>Run</span>
              <select value={runId} onChange={handleRunChange}>
                {runs.map((r) => (
                  <option key={r.run_id} value={r.run_id}>
                    {r.run_id} - {r.status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Ablation</span>
              <select value={ablation} onChange={(e) => setAblation(e.target.value)}>
                {availableAblations.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </label>
            <label>
              <span>ROI quick-pick</span>
              <select value={roiId} onChange={(e) => setRoiId(e.target.value)}>
                {roiMeta.map((r) => (
                  <option key={r.roi_id} value={r.roi_id}>{r.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Activation threshold - {threshold.toFixed(2)}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
              />
            </label>
            <label>
              <span>Time - frame {timeIndex} / {Math.max(0, nTimesteps - 1)}</span>
              <input
                type="range"
                min={0}
                max={Math.max(0, nTimesteps - 1)}
                step={1}
                value={timeIndex}
                onChange={(e) => {
                  const t = Number(e.target.value);
                  setTimeIndex(t);
                  viewerRef.current?.setTimeIndex(t);
                }}
              />
            </label>
            <div className="toggle-row">
              <label>
                <input
                  type="checkbox"
                  checked={hemisphere === "right"}
                  onChange={(e) => setHemisphere(e.target.checked ? "right" : "both")}
                />
                Right hemisphere only
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={parcelOverlay}
                  onChange={(e) => setParcelOverlay(e.target.checked)}
                />
                Parcel overlay
              </label>
            </div>
            <button type="button" onClick={handleExport} disabled={!runId || run?.status !== "succeeded"}>
              Export bundle
            </button>
          </div>
          <Feedback msg={feedback} />
        </aside>

        <section className="panel viewer-panel">
          <p className="panel-kicker">Viewer</p>
          <h2>Predicted cortical activity</h2>
          <p className="meta-copy viewer-note">
            Drag to rotate · scroll to zoom · <a href="#/about" tabIndex={-1}>research use only</a>
          </p>

          {stimulus && (
            <div className="stimulus-caption">
              <span className="eyebrow" style={{ marginRight: ".5rem" }}>Stimulus</span>
              <strong>{stimulus.name}</strong>
              {stimulus.transcript && (
                <span className="meta-copy" style={{ marginLeft: ".5rem", fontStyle: "italic" }}>
                  &ldquo;{stimulus.transcript.length > 120
                    ? `${stimulus.transcript.slice(0, 120)}...`
                    : stimulus.transcript}&rdquo;
                </span>
              )}
            </div>
          )}

          <BrainCanvas
            ref={viewerRef}
            onTimeChange={(t) => setTimeIndex(t)}
            frameRois={frameRois}
            threshold={threshold}
            timeIndex={timeIndex}
          />

          <div className="color-legend" aria-label="Activation color scale">
            <div className="color-legend__bar" />
            <div className="color-legend__labels">
              <span>suppression</span>
              <span>0</span>
              <span>activation</span>
            </div>
          </div>

          <div className="insight-card" style={{ marginBottom: "1rem" }}>
            <p className="insight-card__label">Input aligned to this frame</p>
            <p className="insight-card__title">{alignedEventLabel}</p>
            {alignedEvent && (
              <p className="insight-card__desc">
                {alignedEvent.type} · {alignedEvent.start_seconds.toFixed(1)}s to {alignedEvent.end_seconds.toFixed(1)}s
              </p>
            )}
          </div>

          <div className="viewer-controls">
            <button
              className="btn-ghost"
              type="button"
              disabled={isPlaying}
              onClick={() => {
                viewerRef.current?.play();
                setIsPlaying(true);
              }}
            >
              Play
            </button>
            <button
              className="btn-ghost"
              type="button"
              disabled={!isPlaying}
              onClick={() => {
                viewerRef.current?.pause();
                setIsPlaying(false);
              }}
            >
              Pause
            </button>
            <button className="btn-icon" type="button" onClick={handleSnapshot}>
              Snapshot
            </button>
          </div>

          <LineChart values={timeline?.global_signal} width={560} height={140} />
        </section>

        <aside className="panel">
          <p className="panel-kicker">Current frame</p>
          <h2>ROI evidence</h2>

          <div className="meta-stack" style={{ marginBottom: "1rem" }}>
            <div className="meta-row">
              <span>Aligned input</span>
              <strong>{alignedEventLabel}</strong>
            </div>
            {alignedEvent && (
              <div className="meta-row">
                <span>Time window</span>
                <strong>{alignedEvent.start_seconds.toFixed(1)}s - {alignedEvent.end_seconds.toFixed(1)}s</strong>
              </div>
            )}
          </div>

          {loading && !frameRois.length ? (
            <div className="loading-row" style={{ marginTop: ".75rem" }}>
              <span className="spinner" /> Loading frame activity...
            </div>
          ) : activeNow.length === 0 ? (
            <p className="meta-copy" style={{ marginTop: ".5rem" }}>
              No ROIs exceed the current threshold of {threshold.toFixed(2)} at frame {timeIndex}.
            </p>
          ) : (
            <ol className="compact-list" style={{ marginTop: ".75rem" }}>
              {activeNow.map((item) => (
                <li key={item.roi_id} style={{ marginBottom: ".35rem" }}>
                  <strong>{item.label}</strong>
                  <br />
                  <span className="meta-copy">
                    {item.group} · activation {item.value.toFixed(3)}
                  </span>
                </li>
              ))}
            </ol>
          )}

          <hr className="section-divider" />
          <p className="panel-kicker">Top ROIs</p>
          {loading && !topRois.length ? (
            <div className="loading-row" style={{ marginTop: ".75rem" }}>
              <span className="spinner" /> Loading...
            </div>
          ) : topRois.length === 0 ? (
            <p className="meta-copy" style={{ marginTop: ".5rem" }}>
              No data yet. Waiting for run to succeed.
            </p>
          ) : (
            <ol className="compact-list" style={{ marginTop: ".75rem" }}>
              {topRois.map((item) => (
                <li key={item.roi_id} style={{ marginBottom: ".35rem" }}>
                  <strong>{item.label}</strong>
                  <br />
                  <span className="meta-copy">
                    peak {item.peak_response.toFixed(3)} at {item.peak_time_seconds}s
                  </span>
                </li>
              ))}
            </ol>
          )}

          {roiTrace && (
            <div style={{ marginTop: "1.25rem" }}>
              <p className="panel-kicker">ROI trace</p>
              <LineChart values={roiTrace} width={280} height={140} />
            </div>
          )}
        </aside>
      </section>
    </section>
  );
}
