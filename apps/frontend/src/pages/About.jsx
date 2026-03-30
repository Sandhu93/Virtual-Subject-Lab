export default function About() {
  return (
    <section className="grid-shell">
      <article className="panel">
        <p className="eyebrow">Scientific caveats</p>
        <h2>What this app does</h2>
        <ul className="compact-list">
          <li>Predicts cortical fMRI/BOLD-like activity for an average unseen subject.</li>
          <li>Uses TRIBE-style multimodal pretrained inference only.</li>
          <li>Supports ablations because modality dropout is part of the model training setup.</li>
          <li>Exports reproducible artifacts for teaching and hypothesis testing.</li>
        </ul>
      </article>
      <article className="panel">
        <p className="eyebrow">What it does not do</p>
        <h2>Scope limits</h2>
        <ul className="compact-list">
          <li>No personalized diagnosis or clinical interpretation.</li>
          <li>No neuron-level activity or real-time cognition claims.</li>
          <li>No fine-tuning UI or training pipeline in V1.</li>
          <li>No cloud-specific runtime beyond Docker Compose and MinIO.</li>
        </ul>
      </article>
    </section>
  );
}
