import { useState, useEffect, useRef } from "react";
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
  const [roiId, setRoiId] = useState("");
  const [roiTrace, setRoiTrace] = useState(null);
  const [feedback, setFeedback] = useState("");

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

  // Main workspace load + poll until succeeded
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

      const v = viewerRef.current;
      if (v) {
        v.setRunConfig(runId, ablation, tl.n_timesteps, API_BASE);
        v.setThreshold(threshold);
        v.setHemisphere(hemisphere);
        v.setParcelOverlay(parcelOverlay);
        v.setTimeIndex(timeIndex);
      }

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
      .then((d) => { if (!cancelled) setRoiTrace(d.traces?.[0]?.mean_trace ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [runId, ablation, roiId, run?.status]);

  useEffect(() => { viewerRef.current?.setThreshold(threshold); }, [threshold]);
  useEffect(() => { viewerRef.current?.setHemisphere(hemisphere); }, [hemisphere]);
  useEffect(() => { viewerRef.current?.setParcelOverlay(parcelOverlay); }, [parcelOverlay]);

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

  const availableAblations =
    run?.ablations?.map((a) => a.ablation) || ALL_ABLATIONS;

  // ── Empty state when no run is selected ───────────────────────────────────
  if (!runId) {
    return (
      <div className="grid-shell-single">
        <div className="panel">
          <div className="empty-state">
            <p className="empty-state__title">No run selected</p>
            <p>Go to <a href="#/stimuli">Stimuli</a> to create a stimulus and queue a run, or pick one below.</p>
            {runs.length > 0 && (
              <select
                style={{ maxWidth: 340, margin: "1rem auto 0", display: "block" }}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value)
                    location.hash = `#/runs?id=${encodeURIComponent(e.target.value)}`;
                }}
              >
                <option value="">— pick a run —</option>
                {runs.map((r) => (
                  <option key={r.run_id} value={r.run_id}>
                    {r.run_id} — {r.status}
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
    <section className="workspace-shell">
      {/* ── Left sidebar: controls ── */}
      <aside className="panel">
        {/* Run identity */}
        <p className="eyebrow">Run</p>
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".5rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, wordBreak: "break-all" }}>
            {run?.run_id ?? runId}
          </h2>
          {run && <StatusBadge status={run.status} />}
        </div>

        {loading && (
          <div className="loading-row">
            <span className="spinner" />
            {run?.status === "queued" || run?.status === "processing"
              ? "Waiting for run to complete…"
              : "Loading workspace…"}
          </div>
        )}

        <p className="meta-copy" style={{ marginBottom: "1rem" }}>
          Average unseen subject · cortical only · research use only
        </p>

        <hr className="section-divider" />

        {/* Run & ablation selection */}
        <div className="sidebar-section stack">
          <label>
            <span>Run</span>
            <select value={runId} onChange={handleRunChange}>
              {runs.map((r) => (
                <option key={r.run_id} value={r.run_id}>
                  {r.run_id} — {r.status}
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
        </div>

        <hr className="section-divider" />

        {/* Viewer settings */}
        <div className="sidebar-section stack">
          <label>
            <span>Activation threshold — {threshold.toFixed(2)}</span>
            <input
              type="range" min={0} max={1} step={0.05} value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
            />
          </label>
          <label>
            <span>Time — frame {timeIndex} / {Math.max(0, nTimesteps - 1)}</span>
            <input
              type="range" min={0} max={Math.max(0, nTimesteps - 1)} step={1} value={timeIndex}
              onChange={(e) => {
                const t = Number(e.target.value);
                setTimeIndex(t);
                viewerRef.current?.setTimeIndex(t);
              }}
            />
          </label>
          <div className="toggle-row">
            <label>
              <input type="checkbox" checked={hemisphere === "right"}
                onChange={(e) => setHemisphere(e.target.checked ? "right" : "both")} />
              Right hemisphere only
            </label>
            <label>
              <input type="checkbox" checked={parcelOverlay}
                onChange={(e) => setParcelOverlay(e.target.checked)} />
              Parcel overlay
            </label>
          </div>
        </div>

        <hr className="section-divider" />

        <div className="sidebar-section">
          <button type="button" onClick={handleExport} disabled={!runId || run?.status !== "succeeded"}>
            Export bundle
          </button>
          <Feedback msg={feedback} />
        </div>
      </aside>

      {/* ── Centre: viewer ── */}
      <section className="panel viewer-panel">
        <p className="eyebrow">Cortical viewer</p>
        <h2>Predicted cortical activity</h2>
        <p className="meta-copy viewer-note">
          Drag to rotate · scroll to zoom ·{" "}
          <a href="#/about" tabIndex={-1}>research use only</a>
        </p>

        <BrainCanvas ref={viewerRef} onTimeChange={(t) => setTimeIndex(t)} />

        <div className="viewer-controls">
          <button
            className="btn-ghost"
            type="button"
            disabled={isPlaying}
            onClick={() => { viewerRef.current?.play(); setIsPlaying(true); }}
          >
            ▶ Play
          </button>
          <button
            className="btn-ghost"
            type="button"
            disabled={!isPlaying}
            onClick={() => { viewerRef.current?.pause(); setIsPlaying(false); }}
          >
            ⏸ Pause
          </button>
          <button className="btn-icon" type="button" onClick={handleSnapshot}>
            📷 Snapshot
          </button>
        </div>

        <LineChart values={timeline?.global_signal} width={560} height={140} />
      </section>

      {/* ── Right sidebar: ROI summaries ── */}
      <aside className="panel">
        <p className="eyebrow">ROI summaries</p>
        <h2>Top responding ROIs</h2>

        {loading && !topRois.length ? (
          <div className="loading-row" style={{ marginTop: ".75rem" }}>
            <span className="spinner" /> Loading…
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
            <p className="eyebrow">ROI trace</p>
            <LineChart values={roiTrace} width={280} height={140} />
          </div>
        )}

        <hr className="section-divider" />
        <p className="eyebrow">Caveats</p>
        <p className="meta-copy">
          Predicted hemodynamic (BOLD-like) responses for an average subject. Not real-time
          neural firing.
        </p>
      </aside>
    </section>
  );
}
