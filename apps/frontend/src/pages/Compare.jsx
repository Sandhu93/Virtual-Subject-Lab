import { useState, useEffect } from "react";
import { apiFetch } from "../api";

const ABLATIONS = [
  "full", "text_only", "audio_only", "video_only",
  "text_audio", "text_video", "audio_video",
];

export default function Compare() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);   // { ok, text }
  const [roiDeltas, setRoiDeltas] = useState([]);

  useEffect(() => {
    apiFetch("/runs").then(setRuns).catch(() => {});
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setMsg({ ok: true, text: "Computing contrast…" });
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
        text: `Contrast ${res.contrast_id} — global Δ ${res.global_mean_delta?.toFixed(4) ?? "n/a"}`,
      });
      setRoiDeltas(res.roi_deltas || []);
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setLoading(false);
    }
  }

  const succeededRuns = runs.filter((r) => r.status === "succeeded");

  return (
    <section className="grid-shell">
      <article className="panel">
        <p className="eyebrow">Analysis</p>
        <h2>Contrast two runs</h2>

        {succeededRuns.length < 2 ? (
          <div className="empty-state" style={{ padding: "1.5rem 0" }}>
            <p className="empty-state__title">Not enough succeeded runs</p>
            <p>
              You need at least two succeeded runs. Go to{" "}
              <a href="#/stimuli">Stimuli</a> to create and queue runs.
            </p>
          </div>
        ) : (
          <form className="stack" style={{ marginTop: ".75rem" }} onSubmit={handleSubmit}>
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
              {loading ? <><span className="spinner" /> Computing…</> : "Compare runs"}
            </button>
          </form>
        )}

        {msg && (
          <div className={`alert ${msg.ok ? "alert--info" : "alert--error"}`} style={{ marginTop: ".75rem" }}>
            {msg.text}
          </div>
        )}
      </article>

      <article className="panel">
        <p className="eyebrow">Results</p>
        <h2>ROI contrast</h2>

        {roiDeltas.length === 0 ? (
          <div className="empty-state" style={{ padding: "1.5rem 0" }}>
            <p className="empty-state__title">No results yet</p>
            <p>Run a contrast to see per-ROI deltas here.</p>
          </div>
        ) : (
          <table className="simple-table" style={{ marginTop: ".75rem" }}>
            <thead>
              <tr>
                <th>ROI</th>
                <th>Run A peak</th>
                <th>Run B peak</th>
                <th>Δ</th>
              </tr>
            </thead>
            <tbody>
              {roiDeltas.map((item) => (
                <tr key={item.roi_id ?? item.label}>
                  <td>{item.label}</td>
                  <td>{item.run_a_peak.toFixed(3)}</td>
                  <td>{item.run_b_peak.toFixed(3)}</td>
                  <td style={{ color: item.delta_peak >= 0 ? "#065f46" : "#991b1b", fontWeight: 600 }}>
                    {item.delta_peak >= 0 ? "+" : ""}{item.delta_peak.toFixed(3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
    </section>
  );
}
