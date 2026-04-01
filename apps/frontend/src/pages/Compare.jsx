import { useEffect, useState } from "react";
import { apiFetch } from "../api";

const ABLATIONS = [
  "full", "text_only", "audio_only", "video_only",
  "text_audio", "text_video", "audio_video",
];

export default function Compare() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [roiDeltas, setRoiDeltas] = useState([]);

  useEffect(() => {
    apiFetch("/runs").then(setRuns).catch(() => {});
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setMsg({ ok: true, text: "Computing contrast..." });
    setRoiDeltas([]);
    setLoading(true);
    try {
      const res = await apiFetch("/analysis/contrast", {
        method: "POST",
        body: JSON.stringify({
          run_a_id: fd.get("run_a_id"),
          run_b_id: fd.get("run_b_id"),
          ablation: fd.get("ablation"),
          mode: "mean_difference",
        }),
      });
      setMsg({
        ok: true,
        text: `Contrast ${res.contrast_id} complete. Global delta ${res.global_mean_delta?.toFixed(4) ?? "n/a"}.`,
      });
      setRoiDeltas(res.roi_deltas || []);
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setLoading(false);
    }
  }

  const succeededRuns = runs.filter((r) => r.status === "succeeded");
  const strongestDelta = roiDeltas.length
    ? [...roiDeltas].sort((a, b) => Math.abs(b.delta_peak) - Math.abs(a.delta_peak))[0]
    : null;

  return (
    <section className="page-stack">
      <section className="page-intro">
        <div>
          <p className="eyebrow">Compare runs</p>
          <h2 className="page-intro__title">Pick two completed runs and inspect the delta.</h2>
          <p className="page-intro__desc">
            This page should answer one question clearly: what changed between two runs under the same ablation.
          </p>
        </div>
        <div className="page-intro__meta">
          <div>
            <span>Completed runs</span>
            <strong>{succeededRuns.length}</strong>
          </div>
          <div>
            <span>Strongest delta</span>
            <strong>{strongestDelta ? strongestDelta.label : "No contrast yet"}</strong>
          </div>
        </div>
      </section>

      <section className="content-grid content-grid--split">
        <article className="panel panel--feature">
          <p className="panel-kicker">Setup</p>
          <h2>Run contrast</h2>
          <p className="panel-copy">
            Use the form once, then read the results table below. The page does not need more explanation than that.
          </p>

          {succeededRuns.length < 2 ? (
            <div className="empty-state empty-state--compact">
              <p className="empty-state__title">Not enough succeeded runs</p>
              <p>Finish at least two runs before using contrast analysis.</p>
            </div>
          ) : (
            <form className="stack" onSubmit={handleSubmit}>
              <label>
                <span>Run A</span>
                <select name="run_a_id" required>
                  {succeededRuns.map((r) => (
                    <option key={r.run_id} value={r.run_id}>{r.run_id}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Run B</span>
                <select name="run_b_id" required>
                  {succeededRuns.map((r) => (
                    <option key={r.run_id} value={r.run_id}>{r.run_id}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Ablation</span>
                <select name="ablation">
                  {ABLATIONS.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={loading}>
                {loading ? "Computing contrast..." : "Run contrast"}
              </button>
            </form>
          )}

          {msg && (
            <div className={`alert ${msg.ok ? "alert--info" : "alert--error"}`}>
              {msg.text}
            </div>
          )}
        </article>

        <article className="panel">
          <p className="panel-kicker">Readout</p>
          <h2>What changed most</h2>
          {strongestDelta ? (
            <div className="insight-card">
              <p className="insight-card__label">Largest ROI shift</p>
              <p className="insight-card__title">{strongestDelta.label}</p>
              <p className="insight-card__desc">
                Peak delta {strongestDelta.delta_peak >= 0 ? "+" : ""}{strongestDelta.delta_peak.toFixed(3)}.
                Run A peak {strongestDelta.run_a_peak.toFixed(3)}, Run B peak {strongestDelta.run_b_peak.toFixed(3)}.
              </p>
            </div>
          ) : (
            <div className="empty-state empty-state--compact">
              <p className="empty-state__title">No contrast computed yet</p>
              <p>Submit the form to surface the strongest ROI difference.</p>
            </div>
          )}

          <div className="meta-stack">
            <div className="meta-row">
              <span>Available runs</span>
              <strong>{runs.length}</strong>
            </div>
            <div className="meta-row">
              <span>Completed runs</span>
              <strong>{succeededRuns.length}</strong>
            </div>
            <div className="meta-row">
              <span>Mode</span>
              <strong>Mean difference</strong>
            </div>
          </div>
        </article>
      </section>

      <section className="panel section-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Results</p>
            <h2>Per-ROI contrast table</h2>
          </div>
          <p className="section-heading__copy">
            Use the table for ranked evidence, then return to the viewer if you need spatial or temporal context.
          </p>
        </div>

        {roiDeltas.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state__title">No results yet</p>
            <p>Run a contrast to populate this table.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="simple-table">
              <thead>
                <tr>
                  <th>ROI</th>
                  <th>Run A peak</th>
                  <th>Run B peak</th>
                  <th>Delta</th>
                </tr>
              </thead>
              <tbody>
                {roiDeltas.map((item) => (
                  <tr key={item.roi_id ?? item.label}>
                    <td>{item.label}</td>
                    <td>{item.run_a_peak.toFixed(3)}</td>
                    <td>{item.run_b_peak.toFixed(3)}</td>
                    <td className={item.delta_peak >= 0 ? "delta-positive" : "delta-negative"}>
                      {item.delta_peak >= 0 ? "+" : ""}{item.delta_peak.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
