import { useState, useEffect } from "react";
import { apiFetch, API_BASE } from "../api";
import StatusBadge from "../components/StatusBadge";

export default function Exports() {
  const [runs, setRuns] = useState([]);
  const [exports, setExports] = useState([]);
  const [loadingExports, setLoadingExports] = useState(true);
  const [msg, setMsg] = useState(null);

  const reloadExports = () =>
    apiFetch("/exports")
      .then(setExports)
      .catch(() => {})
      .finally(() => setLoadingExports(false));

  useEffect(() => {
    apiFetch("/runs").then(setRuns).catch(() => {});
    reloadExports();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const succeededRuns = runs.filter((r) => r.status === "succeeded");

  async function handleSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setMsg(null);
    try {
      const res = await apiFetch("/exports", {
        method: "POST",
        body: JSON.stringify({ run_id: fd.get("run_id") }),
      });
      setMsg({ ok: true, text: `Export queued — id ${res.export_id}` });
      reloadExports();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
  }

  return (
    <section className="grid-shell">
      <article className="panel">
        <p className="eyebrow">Export</p>
        <h2>Create bundle</h2>

        {succeededRuns.length === 0 ? (
          <div className="empty-state" style={{ padding: "1.5rem 0" }}>
            <p className="empty-state__title">No succeeded runs</p>
            <p>Queue and complete a run in <a href="#/stimuli">Stimuli</a> first.</p>
          </div>
        ) : (
          <form className="stack" style={{ marginTop: ".75rem" }} onSubmit={handleSubmit}>
            <label>
              <span>Run</span>
              <select name="run_id" required>
                {succeededRuns.map((r) => (
                  <option key={r.run_id} value={r.run_id}>{r.run_id}</option>
                ))}
              </select>
            </label>
            <button type="submit">Queue export</button>
          </form>
        )}

        {msg && (
          <div className={`alert ${msg.ok ? "alert--info" : "alert--error"}`} style={{ marginTop: ".75rem" }}>
            {msg.text}
          </div>
        )}
      </article>

      <article className="panel">
        <p className="eyebrow">History</p>
        <h2>Export bundles</h2>

        {loadingExports ? (
          <div className="loading-row" style={{ marginTop: ".75rem" }}>
            <span className="spinner" /> Loading…
          </div>
        ) : exports.length === 0 ? (
          <div className="empty-state" style={{ padding: "1.5rem 0" }}>
            <p className="empty-state__title">No exports yet</p>
            <p>Queue your first export using the form on the left.</p>
          </div>
        ) : (
          <table className="simple-table" style={{ marginTop: ".75rem" }}>
            <thead>
              <tr>
                <th>Export ID</th>
                <th>Run</th>
                <th>Status</th>
                <th>Bundle</th>
              </tr>
            </thead>
            <tbody>
              {exports.map((item) => (
                <tr key={item.export_id}>
                  <td style={{ fontFamily: "monospace", fontSize: ".8rem" }}>{item.export_id}</td>
                  <td style={{ fontFamily: "monospace", fontSize: ".8rem" }}>{item.run_id}</td>
                  <td><StatusBadge status={item.status} /></td>
                  <td>
                    {item.bundle_key ? (
                      <a href={`${API_BASE}/exports/${item.export_id}/download`}>
                        Download
                      </a>
                    ) : (
                      <span className="meta-copy">—</span>
                    )}
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
