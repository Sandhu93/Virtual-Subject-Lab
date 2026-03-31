import { useState, useEffect } from "react";
import { apiFetch } from "../api";

function PipelineStep({ num, title, stat, href, linkLabel, done }) {
  return (
    <a href={href} className={`pipeline__step ${done ? "pipeline__step--done" : ""}`}>
      <span className="pipeline__num">{done ? "✓" : num}</span>
      <p className="pipeline__title">{title}</p>
      <p className="pipeline__stat">{stat}</p>
      <span className="pipeline__link">{linkLabel} →</span>
    </a>
  );
}

export default function Home() {
  const [stimuli, setStimuli] = useState([]);
  const [runs, setRuns] = useState([]);
  const [exports, setExports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch("/stimuli").catch(() => []),
      apiFetch("/runs").catch(() => []),
      apiFetch("/exports").catch(() => []),
    ]).then(([s, r, e]) => {
      setStimuli(Array.isArray(s) ? s : []);
      setRuns(Array.isArray(r) ? r : []);
      setExports(Array.isArray(e) ? e : []);
      setLoading(false);
    });
  }, []);

  const readyStimuli = stimuli.filter((s) => s.status === "ready");
  const succeededRuns = runs.filter((r) => r.status === "succeeded");
  const latestRun = runs[0] ?? null;

  let nextStep = null;
  if (!loading) {
    if (readyStimuli.length === 0) {
      nextStep = {
        label: "Step 1 — Get started",
        title: "Create your first stimulus",
        desc: "Paste a sentence, upload an audio file, or upload a video. This is the input the model will process.",
        href: "#/stimuli",
        cta: "Create stimulus",
      };
    } else if (succeededRuns.length === 0 && runs.length === 0) {
      nextStep = {
        label: "Step 2 — Queue a run",
        title: "Queue a cortical prediction run",
        desc: `You have ${readyStimuli.length} ready stimulus${readyStimuli.length > 1 ? "i" : ""}. Select one and queue a run to predict cortical activity.`,
        href: "#/stimuli",
        cta: "Queue a run",
      };
    } else if (succeededRuns.length === 0) {
      nextStep = {
        label: "Step 2 — Waiting",
        title: "Run is processing",
        desc: latestRun
          ? `Run ${latestRun.run_id} is currently ${latestRun.status}. The page will update automatically when it completes.`
          : "Check the Runs page for current status.",
        href: latestRun
          ? `#/runs?id=${encodeURIComponent(latestRun.run_id)}`
          : "#/runs",
        cta: "View run status",
      };
    } else if (succeededRuns.length < 2) {
      nextStep = {
        label: "Step 3 — Explore results",
        title: "Inspect cortical activation",
        desc: "Your run succeeded. Open the 3-D cortical viewer to explore which brain regions responded, at which time.",
        href: `#/runs?id=${encodeURIComponent(succeededRuns[0].run_id)}`,
        cta: "Open viewer",
      };
    } else {
      nextStep = {
        label: "Step 4 — Analysis",
        title: "Compare runs or export a bundle",
        desc: `You have ${succeededRuns.length} succeeded runs. Contrast two runs by ablation, or download a data bundle for offline analysis.`,
        href: "#/compare",
        cta: "Compare runs",
      };
    }
  }

  const loadingText = loading ? "Loading…" : null;

  return (
    <>
      <div className="pipeline">
        <PipelineStep
          num={1}
          title="Create stimulus"
          stat={loadingText ?? (readyStimuli.length > 0 ? `${readyStimuli.length} ready` : "No stimuli yet")}
          href="#/stimuli"
          linkLabel="Go to Stimuli"
          done={readyStimuli.length > 0}
        />
        <PipelineStep
          num={2}
          title="Queue a run"
          stat={loadingText ?? (runs.length > 0 ? `${runs.length} run${runs.length > 1 ? "s" : ""} · ${succeededRuns.length} succeeded` : "No runs yet")}
          href="#/stimuli"
          linkLabel="Queue a run"
          done={succeededRuns.length > 0}
        />
        <PipelineStep
          num={3}
          title="Inspect results"
          stat={loadingText ?? (succeededRuns.length > 0 ? `${succeededRuns.length} run${succeededRuns.length > 1 ? "s" : ""} ready` : "Waiting for a run to succeed")}
          href="#/runs"
          linkLabel="View runs"
          done={succeededRuns.length > 0}
        />
        <PipelineStep
          num={4}
          title="Compare & export"
          stat={loadingText ?? (exports.length > 0 ? `${exports.length} export${exports.length > 1 ? "s" : ""}` : "No exports yet")}
          href="#/compare"
          linkLabel="Compare runs"
          done={exports.length > 0}
        />
      </div>

      {!loading && nextStep && (
        <div className="next-step-cta">
          <div>
            <p className="next-step-cta__label">{nextStep.label}</p>
            <p className="next-step-cta__title">{nextStep.title}</p>
            <p className="next-step-cta__desc">{nextStep.desc}</p>
          </div>
          <a href={nextStep.href} className="btn-primary-cta">{nextStep.cta} →</a>
        </div>
      )}

      <div className="grid-shell">
        <div className="panel">
          <p className="eyebrow">About</p>
          <h2>virtual-subject</h2>
          <p className="meta-copy" style={{ marginTop: ".5rem" }}>
            Predicts hemodynamic (BOLD-like) cortical responses for an average subject
            from any text, audio, or video stimulus. Not real-time neural firing — research use only.
          </p>
        </div>
        <div className="panel">
          <p className="eyebrow">Caveats</p>
          <ul className="compact-list meta-copy">
            <li>Average subject — not individual predictions.</li>
            <li>Predicted BOLD-like responses, not neuronal firing.</li>
            <li>Research use only — not for clinical decisions.</li>
          </ul>
        </div>
      </div>
    </>
  );
}
