import { useState, useEffect } from "react";
import { apiFetch, API_BASE } from "../api";

export default function Exports() {
  const [runs, setRuns] = useState([]);
  const [exports, setExports] = useState([]);
  const [feedback, setFeedback] = useState("");

  const reloadExports = () => apiFetch("/exports").then(setExports).catch(() => {});

  useEffect(() => {
    apiFetch("/runs").then(setRuns).catch(() => {});
    reloadExports();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const res = await apiFetch("/exports", {
        method: "POST",
        body: JSON.stringify({ run_id: fd.get("run_id") }),
      });
      setFeedback(JSON.stringify(res, null, 2));
      reloadExports();
    } catch (err) {
      setFeedback(`Error: ${err.message}`);
    }
  }

  return (
    <section className="grid-shell">
      <article className="panel">
        <p className="eyebrow">Exports</p>
        <h2>Create bundle</h2>
        <form className="stack" onSubmit={handleSubmit}>
          <label>
            <span>Run</span>
            <select name="run_id" required>
              {runs.map((r) => (
                <option key={r.run_id} value={r.run_id}>
                  {r.run_id} — {r.status}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Queue export</button>
        </form>
        <pre className="feedback">{feedback}</pre>
      </article>

      <article className="panel">
        <p className="eyebrow">History</p>
        <h2>Bundles</h2>
        <table className="simple-table">
          <thead>
            <tr>
              <th>Export</th>
              <th>Run</th>
              <th>Status</th>
              <th>Bundle</th>
            </tr>
          </thead>
          <tbody>
            {exports.map((item) => (
              <tr key={item.export_id}>
                <td>{item.export_id}</td>
                <td>{item.run_id}</td>
                <td>{item.status}</td>
                <td>
                  {item.bundle_key ? (
                    <a href={`${API_BASE}/exports/${item.export_id}/download`}>Download</a>
                  ) : (
                    "Pending"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </section>
  );
}
