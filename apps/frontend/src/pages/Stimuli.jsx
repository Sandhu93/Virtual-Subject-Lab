import { useState, useEffect } from "react";
import { apiFetch, API_BASE } from "../api";
import StatusBadge from "../components/StatusBadge";

export default function Stimuli() {
  const [stimuli, setStimuli] = useState([]);
  const [loading, setLoading] = useState(true);
  const [textMsg, setTextMsg] = useState(null);   // { ok, text }
  const [fileMsg, setFileMsg] = useState(null);
  const [runMsg, setRunMsg] = useState(null);

  const reload = () =>
    apiFetch("/stimuli")
      .then(setStimuli)
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const readyStimuli = stimuli.filter((s) => s.status === "ready");

  async function handleTextSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setTextMsg(null);
    try {
      await apiFetch("/stimuli/text", {
        method: "POST",
        body: JSON.stringify({ name: fd.get("name"), text: fd.get("text") }),
      });
      setTextMsg({ ok: true, text: "Stimulus created and ready." });
      reload();
    } catch (err) {
      setTextMsg({ ok: false, text: err.message });
    }
  }

  async function handleFileSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file");
    if (!(file instanceof File)) return;
    setFileMsg({ ok: true, text: "Uploading…" });
    try {
      const created = await apiFetch("/stimuli", {
        method: "POST",
        body: JSON.stringify({
          name: fd.get("name"),
          source_type: fd.get("source_type"),
          mime_type: file.type || null,
          filename: file.name,
        }),
      });
      const uploadBody = new FormData();
      uploadBody.append("file", file);
      await apiFetch(created.upload_url.replace(API_BASE, ""), { method: "PUT", body: uploadBody });
      await apiFetch(created.finalize_url.replace(API_BASE, ""), { method: "POST" });
      setFileMsg({ ok: true, text: "File uploaded and finalized." });
      reload();
    } catch (err) {
      setFileMsg({ ok: false, text: err.message });
    }
  }

  async function handleRunSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const ablations = String(fd.get("ablations") || "full")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    setRunMsg(null);
    try {
      const res = await apiFetch("/runs", {
        method: "POST",
        body: JSON.stringify({ stimulus_id: fd.get("stimulus_id"), ablations }),
      });
      setRunMsg({ ok: true, text: `Run queued — opening workspace…`, runId: res.run_id });
      setTimeout(() => {
        location.hash = `#/runs?id=${encodeURIComponent(res.run_id)}`;
      }, 800);
    } catch (err) {
      setRunMsg({ ok: false, text: err.message });
    }
  }

  return (
    <section>
      <section className="grid-shell">
        {/* Text stimulus */}
        <article className="panel">
          <p className="eyebrow">Step 1 — Text</p>
          <h2>Paste text</h2>
          <form className="stack" style={{ marginTop: ".75rem" }} onSubmit={handleTextSubmit}>
            <label>
              <span>Name</span>
              <input type="text" name="name" defaultValue="Text stimulus" required />
            </label>
            <label>
              <span>Stimulus text</span>
              <textarea
                name="text" rows={6} required
                defaultValue="The sailors are annoyed by the noise of the seagulls."
              />
            </label>
            <button type="submit">Create text stimulus</button>
          </form>
          {textMsg && (
            <div className={`alert ${textMsg.ok ? "alert--info" : "alert--error"}`} style={{ marginTop: ".75rem" }}>
              {textMsg.text}
            </div>
          )}
        </article>

        {/* File stimulus */}
        <article className="panel">
          <p className="eyebrow">Step 1 — Audio / Video</p>
          <h2>Upload a file</h2>
          <form className="stack" style={{ marginTop: ".75rem" }} onSubmit={handleFileSubmit}>
            <label>
              <span>Name</span>
              <input type="text" name="name" defaultValue="Uploaded stimulus" required />
            </label>
            <label>
              <span>Source type</span>
              <select name="source_type">
                <option value="audio">Audio</option>
                <option value="video">Video</option>
              </select>
            </label>
            <label>
              <span>File</span>
              <input type="file" name="file" accept="audio/*,video/*" required />
            </label>
            <button type="submit">Upload and finalize</button>
          </form>
          {fileMsg && (
            <div className={`alert ${fileMsg.ok ? "alert--info" : "alert--error"}`} style={{ marginTop: ".75rem" }}>
              {fileMsg.text}
            </div>
          )}
        </article>

        {/* Queue run */}
        <article className="panel">
          <p className="eyebrow">Step 2 — Run</p>
          <h2>Queue a run</h2>
          {readyStimuli.length === 0 ? (
            <div className="empty-state" style={{ padding: "1.5rem 0" }}>
              <p className="empty-state__title">No ready stimuli</p>
              <p>Create a text or file stimulus first.</p>
            </div>
          ) : (
            <form className="stack" style={{ marginTop: ".75rem" }} onSubmit={handleRunSubmit}>
              <label>
                <span>Stimulus</span>
                <select name="stimulus_id" required>
                  {readyStimuli.map((s) => (
                    <option key={s.stimulus_id} value={s.stimulus_id}>
                      {s.name} — {s.source_type}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Ablations (comma-separated)</span>
                <input
                  type="text" name="ablations"
                  defaultValue="full,text_only,audio_only,video_only,text_audio,text_video,audio_video"
                />
              </label>
              <button type="submit">Queue run</button>
            </form>
          )}
          {runMsg && (
            <div className={`alert ${runMsg.ok ? "alert--info" : "alert--error"}`} style={{ marginTop: ".75rem" }}>
              {runMsg.text}
            </div>
          )}
          <p className="meta-copy" style={{ marginTop: ".75rem", fontSize: ".78rem" }}>
            Stimuli are content-hashed. Duplicate run configs reuse the cached successful result.
          </p>
        </article>
      </section>

      {/* Stimuli table */}
      <section className="panel grid-shell-single">
        <p className="eyebrow">Library</p>
        <h2>All stimuli</h2>

        {loading ? (
          <div className="loading-row" style={{ marginTop: ".75rem" }}>
            <span className="spinner" /> Loading stimuli…
          </div>
        ) : stimuli.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state__title">No stimuli yet</p>
            <p>Create your first stimulus using the forms above.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto", marginTop: ".75rem" }}>
            <table className="simple-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Modalities</th>
                  <th>Duration</th>
                  <th>Transcript</th>
                  <th>Word timings</th>
                </tr>
              </thead>
              <tbody>
                {stimuli.map((s) => {
                  const preview = s.transcript
                    ? s.transcript.length > 55
                      ? s.transcript.slice(0, 55) + "…"
                      : s.transcript
                    : "—";
                  return (
                    <tr key={s.stimulus_id}>
                      <td>{s.name}</td>
                      <td>{s.source_type}</td>
                      <td><StatusBadge status={s.status} /></td>
                      <td>{(s.modalities || []).join(", ") || "—"}</td>
                      <td>{(s.duration_seconds || 0).toFixed(1)}s</td>
                      <td title={s.transcript || ""}>{preview}</td>
                      <td>{s.word_timing_status || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
