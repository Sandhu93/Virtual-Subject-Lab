import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import StatusBadge from "../components/StatusBadge";

function StageChip({ title, value, href, active }) {
  return (
    <a href={href} className={`stage-chip ${active ? "stage-chip--active" : ""}`}>
      <span className="stage-chip__title">{title}</span>
      <span className="stage-chip__value">{value}</span>
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
  const processingRuns = runs.filter((r) => r.status === "processing" || r.status === "queued");
  const latestRun = runs[0] ?? null;
  const latestExport = exports[0] ?? null;

  let nextStep = null;
  if (!loading) {
    if (readyStimuli.length === 0) {
      nextStep = {
        label: "Next action",
        title: "Create your first stimulus",
        desc: "Start with text or upload media. The rest of the workflow stays locked until at least one stimulus is ready.",
        href: "#/stimuli",
        cta: "Open Stimuli",
      };
    } else if (runs.length === 0) {
      nextStep = {
        label: "Next action",
        title: "Queue the first prediction run",
        desc: `${readyStimuli.length} stimulus${readyStimuli.length === 1 ? "" : "es"} are ready. Launch a run to generate the first cortical timeline.`,
        href: "#/stimuli",
        cta: "Queue a run",
      };
    } else if (succeededRuns.length === 0) {
      nextStep = {
        label: "Current status",
        title: "Wait for the active run to finish",
        desc: latestRun
          ? `${latestRun.run_id} is ${latestRun.status}. Open the run workspace to monitor progress.`
          : "Open the Runs page to track active jobs.",
        href: latestRun ? `#/runs?id=${encodeURIComponent(latestRun.run_id)}` : "#/runs",
        cta: "Open Runs",
      };
    } else if (succeededRuns.length < 2) {
      nextStep = {
        label: "Next action",
        title: "Inspect the latest successful run",
        desc: "Open the viewer, scrub through frames, and inspect which ROIs activate over time.",
        href: `#/runs?id=${encodeURIComponent(succeededRuns[0].run_id)}`,
        cta: "Open viewer",
      };
    } else {
      nextStep = {
        label: "Next action",
        title: "Compare runs or export a bundle",
        desc: `You already have ${succeededRuns.length} successful runs. Move into analysis or package a bundle for offline review.`,
        href: "#/compare",
        cta: "Compare runs",
      };
    }
  }

  return (
    <section className="page-stack">
      <section className="panel home-hero">
        <div className="home-hero__main">
          <p className="eyebrow">{nextStep?.label ?? "Home"}</p>
          <h2 className="home-hero__title">{nextStep?.title ?? "Loading workspace..."}</h2>
          <p className="home-hero__desc">
            {nextStep?.desc ?? "Gathering current pipeline state."}
          </p>

          <div className="home-hero__actions">
            {nextStep && (
              <a href={nextStep.href} className="btn-primary-cta">
                {nextStep.cta}
              </a>
            )}
            <div className="home-hero__stats">
              <div>
                <span>Ready stimuli</span>
                <strong>{loading ? "..." : readyStimuli.length}</strong>
              </div>
              <div>
                <span>Active runs</span>
                <strong>{loading ? "..." : processingRuns.length}</strong>
              </div>
              <div>
                <span>Successful runs</span>
                <strong>{loading ? "..." : succeededRuns.length}</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="stage-strip">
        <StageChip
          title="Stimuli"
          value={loading ? "Loading..." : readyStimuli.length > 0 ? `${readyStimuli.length} ready` : "Not started"}
          href="#/stimuli"
          active={readyStimuli.length === 0}
        />
        <StageChip
          title="Runs"
          value={loading ? "Loading..." : runs.length > 0 ? `${runs.length} total` : "Not started"}
          href="#/runs"
          active={readyStimuli.length > 0 && runs.length === 0}
        />
        <StageChip
          title="Review"
          value={loading ? "Loading..." : succeededRuns.length > 0 ? `${succeededRuns.length} ready` : "Waiting"}
          href="#/runs"
          active={runs.length > 0 && succeededRuns.length === 0}
        />
        <StageChip
          title="Export"
          value={loading ? "Loading..." : exports.length > 0 ? `${exports.length} bundles` : "Optional"}
          href="#/exports"
          active={succeededRuns.length > 1}
        />
      </section>

      <section className="panel home-support">
        <div className="home-support__item">
          <span className="home-support__label">Latest run</span>
          <strong className="home-support__value">
            {latestRun ? latestRun.run_id : "No run queued"}
          </strong>
          <div className="home-support__meta">
            {latestRun ? <StatusBadge status={latestRun.status} /> : <span className="meta-copy">Idle</span>}
          </div>
        </div>

        <div className="home-support__item">
          <span className="home-support__label">Latest export</span>
          <strong className="home-support__value">
            {latestExport ? latestExport.export_id : "No bundle yet"}
          </strong>
          <div className="home-support__meta">
            <a href="#/exports">Open exports</a>
          </div>
        </div>

        <div className="home-support__item">
          <span className="home-support__label">Scope</span>
          <strong className="home-support__value">Average-subject, research-only prediction</strong>
          <div className="home-support__meta">
            <a href="#/about">Read caveats</a>
          </div>
        </div>
      </section>
    </section>
  );
}
