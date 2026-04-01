import { useEffect, useState } from "react";
import { apiFetch, API_BASE } from "../api";
import StatusBadge from "../components/StatusBadge";

export default function Exports() {
  const [runs, setRuns] = useState([]);
  const [exports, setExports] = useState([]);
  const [loadingExports, setLoadingExports] = useState(true);
  const [msg, setMsg] = useState(null);
  const [deletingExportId, setDeletingExportId] = useState("");

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
  const readyExports = exports.filter((item) => item.bundle_key);

  async function handleSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setMsg(null);
    try {
      const res = await apiFetch("/exports", {
        method: "POST",
        body: JSON.stringify({ run_id: fd.get("run_id") }),
      });
      setMsg({ ok: true, text: `Export queued with id ${res.export_id}.` });
      reloadExports();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
  }

  async function handleDeleteExport(exportId) {
    const confirmed = window.confirm("Delete this export entry? This cannot be undone.");
    if (!confirmed) return;

    setMsg(null);
    setDeletingExportId(exportId);
    try {
      await apiFetch(`/exports/${exportId}`, { method: "DELETE" });
      setMsg({ ok: true, text: "Export deleted." });
      reloadExports();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setDeletingExportId("");
    }
  }

  return (
    <section className="page-stack">
      <section className="page-intro">
        <div>
          <p className="eyebrow">Exports</p>
          <h2 className="page-intro__title">Queue a bundle, then download it when ready.</h2>
          <p className="page-intro__desc">
            Export is the last step in the workflow. The page should stay quiet until you need a bundle.
          </p>
        </div>
        <div className="page-intro__meta">
          <div>
            <span>Completed runs</span>
            <strong>{succeededRuns.length}</strong>
          </div>
          <div>
            <span>Ready bundles</span>
            <strong>{loadingExports ? "..." : readyExports.length}</strong>
          </div>
        </div>
      </section>

      <section className="content-grid content-grid--split">
        <article className="panel panel--feature">
          <p className="panel-kicker">Create bundle</p>
          <h2>Queue export</h2>
          <p className="panel-copy">
            Pick one completed run and generate a reproducible bundle for offline review.
          </p>

          {succeededRuns.length === 0 ? (
            <div className="empty-state empty-state--compact">
              <p className="empty-state__title">No succeeded runs</p>
              <p>Finish a run before attempting export.</p>
            </div>
          ) : (
            <form className="stack" onSubmit={handleSubmit}>
              <label>
                <span>Run</span>
                <select name="run_id" required>
                  {succeededRuns.map((r) => (
                    <option key={r.run_id} value={r.run_id}>{r.run_id}</option>
                  ))}
                </select>
              </label>
              <button type="submit">Queue export bundle</button>
            </form>
          )}

          {msg && (
            <div className={`alert ${msg.ok ? "alert--info" : "alert--error"}`}>
              {msg.text}
            </div>
          )}
        </article>

        <article className="panel">
          <p className="panel-kicker">Status</p>
          <h2>Current export state</h2>
          <div className="meta-stack">
            <div className="meta-row">
              <span>Total exports</span>
              <strong>{loadingExports ? "..." : exports.length}</strong>
            </div>
            <div className="meta-row">
              <span>Queued exports</span>
              <strong>{exports.filter((item) => item.status === "queued").length}</strong>
            </div>
            <div className="meta-row">
              <span>Download-ready</span>
              <strong>{readyExports.length}</strong>
            </div>
          </div>
        </article>
      </section>

      <section className="panel section-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">History</p>
            <h2>Export bundle log</h2>
          </div>
          <p className="section-heading__copy">
            This table is reference history. Download links only appear when the bundle is ready.
          </p>
        </div>

        {loadingExports ? (
          <div className="loading-row">
            <span className="spinner" /> Loading exports...
          </div>
        ) : exports.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state__title">No exports yet</p>
            <p>Queue your first export using the form above.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="simple-table">
              <thead>
                <tr>
                  <th>Export ID</th>
                  <th>Run</th>
                  <th>Status</th>
                  <th>Bundle</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {exports.map((item) => (
                  <tr key={item.export_id}>
                    <td className="table-mono">{item.export_id}</td>
                    <td className="table-mono">{item.run_id}</td>
                    <td><StatusBadge status={item.status} /></td>
                    <td>
                      {item.bundle_key ? (
                        <a href={`${API_BASE}/exports/${item.export_id}/download`} className="text-link-strong">
                          Download bundle
                        </a>
                      ) : (
                        <span className="meta-copy">Not ready yet</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-danger-subtle"
                        disabled={deletingExportId === item.export_id}
                        onClick={() => handleDeleteExport(item.export_id)}
                      >
                        {deletingExportId === item.export_id ? "Deleting..." : "Delete"}
                      </button>
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
