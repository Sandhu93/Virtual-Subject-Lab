export default function Home() {
  return (
    <section className="hero route-panel">
      <div className="panel">
        <p className="eyebrow">Status</p>
        <h2>Separate frontend online</h2>
        <p>
          This UI is served from its own frontend container and talks to the FastAPI backend
          over HTTP.
        </p>
      </div>
      <div className="panel">
        <p className="eyebrow">Caveats</p>
        <ul>
          <li>Average subject predictions only.</li>
          <li>Predicted BOLD-like responses, not neuronal firing.</li>
          <li>Research use only.</li>
        </ul>
      </div>
      <div className="panel">
        <p className="eyebrow">Stack</p>
        <p>
          Frontend: React + Vite + Oat. Backend: FastAPI + worker + Postgres + MinIO.
        </p>
      </div>
      <div className="panel">
        <p className="eyebrow">Workflow</p>
        <ol className="compact-list">
          <li>Create a text, audio, or video stimulus.</li>
          <li>Queue a run in average-subject cortical mode.</li>
          <li>Inspect ablations, ROI traces, compare runs, and export a bundle.</li>
        </ol>
      </div>
    </section>
  );
}
