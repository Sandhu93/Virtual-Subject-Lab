import { useState, useEffect } from "react";
import { apiFetch, API_BASE } from "../api";

export default function Stimuli() {
  const [stimuli, setStimuli] = useState([]);
  const [feedback, setFeedback] = useState("");

  const reload = () => apiFetch("/stimuli").then(setStimuli).catch(() => {});

  useEffect(() => {
    reload();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const readyStimuli = stimuli.filter((s) => s.status === "ready");

  async function handleTextSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const res = await apiFetch("/stimuli/text", {
        method: "POST",
        body: JSON.stringify({ name: fd.get("name"), text: fd.get("text") }),
      });
      setFeedback(JSON.stringify(res, null, 2));
      reload();
    } catch (err) {
      setFeedback(`Error: ${err.message}`);
    }
  }

  async function handleFileSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file");
    if (!(file instanceof File)) return;
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
      const finalized = await apiFetch(created.finalize_url.replace(API_BASE, ""), {
        method: "POST",
      });
      setFeedback(JSON.stringify(finalized, null, 2));
      reload();
    } catch (err) {
      setFeedback(`Error: ${err.message}`);
    }
  }

  async function handleRunSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const ablations = String(fd.get("ablations") || "full")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      const res = await apiFetch("/runs", {
        method: "POST",
        body: JSON.stringify({ stimulus_id: fd.get("stimulus_id"), ablations }),
      });
      setFeedback(JSON.stringify(res, null, 2));
      location.hash = `#/runs?id=${encodeURIComponent(res.run_id)}`;
    } catch (err) {
      setFeedback(`Error: ${err.message}`);
    }
  }

  return (
    <section>
      <section className="grid-shell">
        <article className="panel">
          <p className="eyebrow">Text stimulus</p>
          <h2>Paste text</h2>
          <form className="stack" onSubmit={handleTextSubmit}>
            <label>
              <span>Name</span>
              <input type="text" name="name" defaultValue="Text stimulus" required />
            </label>
            <label>
              <span>Stimulus text</span>
              <textarea
                name="text"
                rows={8}
                required
                defaultValue="The sailors are annoyed by the noise of the seagulls."
              />
            </label>
            <button type="submit">Create text stimulus</button>
          </form>
        </article>

        <article className="panel">
          <p className="eyebrow">File stimulus</p>
          <h2>Upload audio or video</h2>
          <form className="stack" onSubmit={handleFileSubmit}>
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
        </article>

        <article className="panel">
          <p className="eyebrow">Run setup</p>
          <h2>Queue a run</h2>
          <form className="stack" onSubmit={handleRunSubmit}>
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
              <span>Ablations</span>
              <input
                type="text"
                name="ablations"
                defaultValue="full,text_only,audio_only,video_only,text_audio,text_video,audio_video"
              />
            </label>
            <button type="submit">Create run</button>
          </form>
          <p className="meta-copy">
            Stimuli are hashed on finalize. Matching run configs reuse the cached successful run.
          </p>
          <pre className="feedback">{feedback}</pre>
        </article>
      </section>

      <section className="panel grid-shell-single" style={{ marginTop: "var(--space-4)" }}>
        <p className="eyebrow">Current stimuli</p>
        <h2>Recent stimuli</h2>
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
                ? s.transcript.length > 60
                  ? s.transcript.slice(0, 60) + "…"
                  : s.transcript
                : "—";
              return (
                <tr key={s.stimulus_id}>
                  <td>{s.name}</td>
                  <td>{s.source_type}</td>
                  <td>{s.status}</td>
                  <td>{(s.modalities || []).join(", ")}</td>
                  <td>{(s.duration_seconds || 0).toFixed(1)}s</td>
                  <td title={s.transcript || ""}>{preview}</td>
                  <td>{s.word_timing_status || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </section>
  );
}
