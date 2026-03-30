import { useState, useEffect } from "react";
import { apiFetch } from "../api";

const ABLATIONS = ["full", "text_only", "audio_only", "video_only", "text_audio", "text_video", "audio_video"];

export default function Compare() {
  const [runs, setRuns] = useState([]);
  const [feedback, setFeedback] = useState("");
  const [roiDeltas, setRoiDeltas] = useState([]);

  useEffect(() => {
    apiFetch("/runs").then(setRuns).catch(() => {});
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setFeedback("Computing contrast…");
    setRoiDeltas([]);
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
      setFeedback(
        JSON.stringify(
          {
            contrast_id: res.contrast_id,
            global_mean_delta: res.global_mean_delta,
            vertices_url: res.vertices_url,
          },
          null,
          2
        )
      );
      setRoiDeltas(res.roi_deltas || []);
    } catch (err) {
      setFeedback(`Error: ${err.message}`);
    }
  }

  return (
    <section className="grid-shell">
      <article className="panel">
        <p className="eyebrow">Batch compare</p>
        <h2>Contrast two runs</h2>
        <form className="stack" onSubmit={handleSubmit}>
          <label>
            <span>Run A</span>
            <select name="run_a_id" required>
              {runs.map((r) => (
                <option key={r.run_id} value={r.run_id}>
                  {r.run_id} — {r.status}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Run B</span>
            <select name="run_b_id" required>
              {runs.map((r) => (
                <option key={r.run_id} value={r.run_id}>
                  {r.run_id} — {r.status}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Ablation</span>
            <select name="ablation">
              {ABLATIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Compare runs</button>
        </form>
      </article>

      <article className="panel">
        <p className="eyebrow">Output</p>
        <h2>Contrast summary</h2>
        <pre className="feedback">{feedback}</pre>
        {roiDeltas.length > 0 && (
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
                  <td>{item.delta_peak.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
    </section>
  );
}
