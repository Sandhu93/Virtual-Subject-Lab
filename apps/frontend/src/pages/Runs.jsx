import { useState, useEffect, useRef } from "react";
import { apiFetch, API_BASE } from "../api";
import BrainCanvas from "../components/BrainCanvas";
import LineChart from "../components/LineChart";

const ATLAS_ID = "lab_curated_v1";

export default function Runs({ params }) {
  // runId is derived directly from URL params so navigating to #/runs?id=X always
  // picks up the new run without stale state.
  const runId = params.get("id") || "";

  const [runs, setRuns] = useState([]);
  const [run, setRun] = useState(null);
  const [roiMeta, setRoiMeta] = useState([]);

  // Viewer controls — initialised from URL so links are fully shareable
  const [ablation, setAblation] = useState(() => params.get("ablation") || "full");
  const [threshold, setThreshold] = useState(() => Number(params.get("threshold")) || 0.25);
  const [timeIndex, setTimeIndex] = useState(() => Number(params.get("time")) || 0);
  const [hemisphere, setHemisphere] = useState(() => params.get("hemisphere") || "both");
  const [parcelOverlay, setParcelOverlay] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);

  // Data from workspace load
  const [nTimesteps, setNTimesteps] = useState(0);
  const [timeline, setTimeline] = useState(null);
  const [topRois, setTopRois] = useState([]);
  const [roiId, setRoiId] = useState("");
  const [roiTrace, setRoiTrace] = useState(null);
  const [feedback, setFeedback] = useState("");

  const viewerRef = useRef(null);

  // Load runs list and ROI metadata once on mount
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

  // Main workspace effect: re-runs when runId or ablation changes.
  // Threshold/hemisphere/parcel/time are applied imperatively to the viewer
  // and do NOT need to re-trigger a full data fetch.
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    let pollTimer = null;

    async function load() {
      const r = await apiFetch(`/runs/${runId}`);
      if (cancelled) return;
      setRun(r);

      if (r.status !== "succeeded") return; // poll will retry

      clearInterval(pollTimer);
      pollTimer = null;

      const tl = await apiFetch(
        `/runs/${runId}/timeline?ablation=${encodeURIComponent(ablation)}`
      );
      if (cancelled) return;
      setTimeline(tl);
      setNTimesteps(tl.n_timesteps);

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

      // Push shareable URL state via replaceState (no hashchange triggered)
      const p = new URLSearchParams({
        id: runId,
        ablation,
        threshold,
        hemisphere,
        time: timeIndex,
      });
      const hash = `#/runs?${p}`;
      if (location.hash !== hash) history.replaceState(null, "", hash);

      setFeedback(JSON.stringify({ run_id: runId, status: r.status, ablation }, null, 2));
    }

    load().catch((err) => {
      if (!cancelled) setFeedback(`Error: ${err.message}`);
    });

    // Poll until the run succeeds
    pollTimer = setInterval(() => {
      if (!cancelled) load().catch(() => {});
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(pollTimer);
    };
  }, [runId, ablation]); // eslint-disable-line react-hooks/exhaustive-deps

  // ROI trace: re-fetch when run/ablation/roi changes
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

  // Threshold → viewer (no data reload)
  useEffect(() => {
    viewerRef.current?.setThreshold(threshold);
  }, [threshold]);

  // Hemisphere → viewer
  useEffect(() => {
    viewerRef.current?.setHemisphere(hemisphere);
  }, [hemisphere]);

  // Parcel overlay → viewer
  useEffect(() => {
    viewerRef.current?.setParcelOverlay(parcelOverlay);
  }, [parcelOverlay]);

  function handleRunChange(e) {
    // Navigate to the new run; the hash change re-derives runId from params
    location.hash = `#/runs?id=${encodeURIComponent(e.target.value)}&ablation=${ablation}&threshold=${threshold}&hemisphere=${hemisphere}&time=0`;
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
      const res = await apiFetch("/exports", {
        method: "POST",
        body: JSON.stringify({ run_id: runId }),
      });
      setFeedback(JSON.stringify(res, null, 2));
      location.hash = "#/exports";
    } catch (err) {
      setFeedback(`Error: ${err.message}`);
    }
  }

  const availableAblations =
    run?.ablations?.map((a) => a.ablation) ||
    ["full", "text_only", "audio_only", "video_only", "text_audio", "text_video", "audio_video"];

  return (
    <section className="grid-shell workspace-shell" id="run-shell">
      {/* ── Left sidebar ── */}
      <aside className="panel">
        <p className="eyebrow">Run</p>
        <h2>{run?.run_id || "Select or open a run"}</h2>
        <p className="meta-copy">
          Status: <strong>{run?.status || "unknown"}</strong>
        </p>
        <p className="meta-copy">Average unseen subject · cortical only · research use only</p>

        <label>
          <span>Run</span>
          <select value={runId} onChange={handleRunChange}>
            <option value="">— select —</option>
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
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>ROI quick-pick</span>
          <select value={roiId} onChange={(e) => setRoiId(e.target.value)}>
            {roiMeta.map((r) => (
              <option key={r.roi_id} value={r.roi_id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Threshold</span>
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
          <span>Time scrubber</span>
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
            />{" "}
            Right emphasis
          </label>
          <label>
            <input
              type="checkbox"
              checked={parcelOverlay}
              onChange={(e) => setParcelOverlay(e.target.checked)}
            />{" "}
            Parcel labels
          </label>
        </div>

        <button type="button" onClick={handleExport}>
          Create export bundle
        </button>
        <pre className="feedback">{feedback}</pre>
      </aside>

      {/* ── Viewer panel ── */}
      <section className="panel viewer-panel">
        <p className="eyebrow">Cortical viewer</p>
        <h2>Predicted cortical activity</h2>
        <p className="meta-copy viewer-note">
          Drag to rotate · Scroll to zoom · Sphere approximation until{" "}
          <code>python scripts/load_atlases.py</code> is run for real fsaverage5 positions.
        </p>
        <BrainCanvas
          ref={viewerRef}
          onTimeChange={(t) => setTimeIndex(t)}
        />
        <div className="viewer-controls">
          <button
            type="button"
            disabled={isPlaying}
            onClick={() => {
              viewerRef.current?.play();
              setIsPlaying(true);
            }}
          >
            ▶ Play
          </button>
          <button
            type="button"
            disabled={!isPlaying}
            onClick={() => {
              viewerRef.current?.pause();
              setIsPlaying(false);
            }}
          >
            ⏸ Pause
          </button>
          <button type="button" onClick={handleSnapshot}>
            📷 Snapshot
          </button>
        </div>
        <LineChart values={timeline?.global_signal} width={560} height={180} />
      </section>

      {/* ── Right sidebar ── */}
      <aside className="panel">
        <p className="eyebrow">ROI summaries</p>
        <h2>Top responding ROIs</h2>
        <ol className="compact-list">
          {topRois.map((item) => (
            <li key={item.roi_id}>
              {item.label}: peak {item.peak_response.toFixed(3)} at {item.peak_time_seconds}s
            </li>
          ))}
        </ol>
        <div className="trace-shell">
          <p className="eyebrow">ROI trace</p>
          <LineChart values={roiTrace} width={320} height={160} />
        </div>
        <div className="notes-shell">
          <p className="eyebrow">Caveats</p>
          <p className="meta-copy">
            These are predicted hemodynamically delayed BOLD-like responses for an average
            subject, not real-time neural firing.
          </p>
        </div>
      </aside>
    </section>
  );
}
