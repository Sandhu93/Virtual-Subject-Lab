export default function About() {
  return (
    <section className="page-stack">
      <section className="hero-panel hero-panel--reference">
        <div className="hero-panel__content">
          <p className="eyebrow">Reference guide</p>
          <h2 className="hero-panel__title">What this application means, and what it does not claim.</h2>
          <p className="hero-panel__desc">
            The interface is treated as a research instrument. This page exists to anchor interpretation before users overread the visual output.
          </p>
        </div>
      </section>

      <section className="content-grid content-grid--balanced">
        <article className="panel panel--feature">
          <p className="panel-kicker">What the app does</p>
          <h2>Legitimate use</h2>
          <ul className="compact-list">
            <li>Predicts cortical BOLD-like activity for an average unseen subject.</li>
            <li>Accepts text, audio, and video stimuli and supports ablation-based inference.</li>
            <li>Provides frame-level inspection, ROI summaries, contrast analysis, and export bundles.</li>
            <li>Supports teaching, qualitative exploration, and structured hypothesis generation.</li>
          </ul>
        </article>

        <article className="panel">
          <p className="panel-kicker">What the app does not do</p>
          <h2>Hard limits</h2>
          <ul className="compact-list">
            <li>No clinical interpretation or personalized diagnosis.</li>
            <li>No claim of direct neuron-level activity or real-time cognition.</li>
            <li>No subject-specific calibration, training, or fine-tuning workflow in this UI.</li>
            <li>No guarantee that strong visual activation implies causal explanation.</li>
          </ul>
        </article>
      </section>

      <section className="content-grid content-grid--balanced">
        <article className="panel panel--tinted">
          <p className="panel-kicker">Interpretation notes</p>
          <h2>Read carefully</h2>
          <div className="meta-stack">
            <div className="meta-row">
              <span>Signal type</span>
              <strong>Predicted hemodynamic response</strong>
            </div>
            <div className="meta-row">
              <span>Subject model</span>
              <strong>Average unseen subject</strong>
            </div>
            <div className="meta-row">
              <span>Primary use</span>
              <strong>Research only</strong>
            </div>
          </div>
        </article>

        <article className="panel">
          <p className="panel-kicker">Workflow guidance</p>
          <h2>Best way to use the system</h2>
          <ul className="compact-list">
            <li>Start with clean stimuli and explicit naming so downstream comparison remains interpretable.</li>
            <li>Use the run viewer to inspect time-localized activation before drawing conclusions from top-ROI summaries.</li>
            <li>Run contrasts only when the scientific question is narrow enough to justify the comparison.</li>
            <li>Export bundles once a run or contrast is worth preserving outside the live UI.</li>
          </ul>
        </article>
      </section>
    </section>
  );
}
