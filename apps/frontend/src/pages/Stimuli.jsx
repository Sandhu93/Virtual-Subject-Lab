import { useEffect, useState } from "react";
import { apiFetch, API_BASE } from "../api";
import StatusBadge from "../components/StatusBadge";

function Message({ state }) {
  if (!state) return null;
  return (
    <div className={`alert ${state.ok ? "alert--info" : "alert--error"}`}>
      {state.text}
    </div>
  );
}

export default function Stimuli() {
  const [stimuli, setStimuli] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creatorMode, setCreatorMode] = useState("text");
  const [textMsg, setTextMsg] = useState(null);
  const [fileMsg, setFileMsg] = useState(null);
  const [runMsg, setRunMsg] = useState(null);
  const [libraryMsg, setLibraryMsg] = useState(null);
  const [deletingStimulusId, setDeletingStimulusId] = useState("");

  const reload = () =>
    apiFetch("/stimuli")
      .then(setStimuli)
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    reload();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const readyStimuli = stimuli.filter((s) => s.status === "ready");
  const latestStimulus = stimuli[0] ?? null;

  async function handleTextSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setTextMsg(null);
    try {
      await apiFetch("/stimuli/text", {
        method: "POST",
        body: JSON.stringify({ name: fd.get("name"), text: fd.get("text") }),
      });
      setTextMsg({ ok: true, text: "Text stimulus created and marked ready." });
      form.reset();
      reload();
    } catch (err) {
      setTextMsg({ ok: false, text: err.message });
    }
  }

  async function handleFileSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("file");
    if (!(file instanceof File)) return;
    setFileMsg({ ok: true, text: "Uploading file and finalizing metadata..." });
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
      setFileMsg({ ok: true, text: "File stimulus uploaded and finalized." });
      form.reset();
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
      setRunMsg({ ok: true, text: "Run queued. Opening run workspace..." });
      setTimeout(() => {
        location.hash = `#/runs?id=${encodeURIComponent(res.run_id)}`;
      }, 800);
    } catch (err) {
      setRunMsg({ ok: false, text: err.message });
    }
  }

  async function handleDeleteStimulus(stimulusId) {
    const confirmed = window.confirm("Delete this stimulus? This cannot be undone.");
    if (!confirmed) return;

    setLibraryMsg(null);
    setDeletingStimulusId(stimulusId);
    try {
      await apiFetch(`/stimuli/${stimulusId}`, { method: "DELETE" });
      setLibraryMsg({ ok: true, text: "Stimulus deleted." });
      reload();
    } catch (err) {
      setLibraryMsg({ ok: false, text: err.message });
    } finally {
      setDeletingStimulusId("");
    }
  }

  return (
    <section className="page-stack">
      <section className="page-intro">
        <div>
          <p className="eyebrow">Stimulus setup</p>
          <h2 className="page-intro__title">Create a stimulus, then queue a run.</h2>
          <p className="page-intro__desc">
            This page should only do two things well: capture source material and pass it into inference. The library stays below as reference.
          </p>
        </div>
        <div className="page-intro__meta">
          <div>
            <span>Ready stimuli</span>
            <strong>{loading ? "..." : readyStimuli.length}</strong>
          </div>
          <div>
            <span>Latest item</span>
            <strong>{latestStimulus ? latestStimulus.name : "None yet"}</strong>
          </div>
        </div>
      </section>

      <section className="content-grid content-grid--split">
        <article className="panel panel--feature">
          <p className="panel-kicker">Step 1</p>
          <h2>Create stimulus</h2>
          <p className="panel-copy">
            Choose one input mode. Text is the fastest path; media is for timing-sensitive or multimodal experiments.
          </p>

          <div className="mode-switch">
            <button
              type="button"
              className={`mode-switch__button ${creatorMode === "text" ? "mode-switch__button--active" : ""}`}
              onClick={() => setCreatorMode("text")}
            >
              Text
            </button>
            <button
              type="button"
              className={`mode-switch__button ${creatorMode === "media" ? "mode-switch__button--active" : ""}`}
              onClick={() => setCreatorMode("media")}
            >
              Audio / video
            </button>
          </div>

          {creatorMode === "text" ? (
            <>
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
              <Message state={textMsg} />
            </>
          ) : (
            <>
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
              <Message state={fileMsg} />
            </>
          )}
        </article>

        <article className="panel">
          <p className="panel-kicker">Step 2</p>
          <h2>Queue run</h2>
          <p className="panel-copy">
            Select a ready stimulus and send it into the cortical prediction workflow.
          </p>

          {readyStimuli.length === 0 ? (
            <div className="empty-state empty-state--compact">
              <p className="empty-state__title">No ready stimuli yet</p>
              <p>Create or upload a stimulus first.</p>
            </div>
          ) : (
            <form className="stack" onSubmit={handleRunSubmit}>
              <label>
                <span>Stimulus</span>
                <select name="stimulus_id" required>
                  {readyStimuli.map((s) => (
                    <option key={s.stimulus_id} value={s.stimulus_id}>
                      {s.name} - {s.source_type}
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
              <button type="submit">Queue cortical prediction</button>
            </form>
          )}

          <Message state={runMsg} />

          <div className="meta-stack" style={{ marginTop: "1rem" }}>
            <div className="meta-row">
              <span>Total stimuli</span>
              <strong>{loading ? "..." : stimuli.length}</strong>
            </div>
            <div className="meta-row">
              <span>Ready to run</span>
              <strong>{loading ? "..." : readyStimuli.length}</strong>
            </div>
            <div className="meta-row">
              <span>Cache behavior</span>
              <strong>Reuses duplicate successful configs</strong>
            </div>
          </div>
        </article>
      </section>

      <section className="panel section-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Library</p>
            <h2>Stimulus inventory</h2>
          </div>
          <p className="section-heading__copy">
            This table is reference material. Use it to review what already exists, not as the main creation surface.
          </p>
        </div>

        {loading ? (
          <div className="loading-row">
            <span className="spinner" /> Loading stimuli...
          </div>
        ) : stimuli.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state__title">No stimuli yet</p>
            <p>Create your first input using the workflow above.</p>
          </div>
        ) : (
          <div className="table-wrap">
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
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {stimuli.map((s) => {
                  const preview = s.transcript
                    ? s.transcript.length > 70
                      ? `${s.transcript.slice(0, 70)}...`
                      : s.transcript
                    : "-";
                  return (
                    <tr key={s.stimulus_id}>
                      <td>{s.name}</td>
                      <td>{s.source_type}</td>
                      <td><StatusBadge status={s.status} /></td>
                      <td>{(s.modalities || []).join(", ") || "-"}</td>
                      <td>{(s.duration_seconds || 0).toFixed(1)}s</td>
                      <td title={s.transcript || ""}>{preview}</td>
                      <td>{s.word_timing_status || "-"}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-danger-subtle"
                          disabled={deletingStimulusId === s.stimulus_id}
                          onClick={() => handleDeleteStimulus(s.stimulus_id)}
                        >
                          {deletingStimulusId === s.stimulus_id ? "Deleting..." : "Delete"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Message state={libraryMsg} />
      </section>
    </section>
  );
}
