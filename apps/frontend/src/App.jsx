import useHash from "./hooks/useHash";
import Home from "./pages/Home";
import Stimuli from "./pages/Stimuli";
import Runs from "./pages/Runs";
import Compare from "./pages/Compare";
import Exports from "./pages/Exports";
import About from "./pages/About";

const ROUTES = {
  home: {
    component: Home,
    meta: {
      kicker: "Overview",
      title: "Pipeline command view",
      description: "Track the workflow from stimulus ingestion to review, comparison, and export.",
    },
  },
  stimuli: {
    component: Stimuli,
    meta: {
      kicker: "Stage 1",
      title: "Create or upload source material",
      description: "Prepare text, audio, or video inputs and launch new cortical prediction runs.",
    },
  },
  runs: {
    component: Runs,
    meta: {
      kicker: "Stage 2",
      title: "Inspect cortical activity",
      description: "Review frame-level activation, play the timeline, and examine ROI summaries in context.",
    },
  },
  compare: {
    component: Compare,
    meta: {
      kicker: "Stage 3",
      title: "Contrast completed runs",
      description: "Quantify how ablations or alternate stimuli shift peak activity across ROIs.",
    },
  },
  exports: {
    component: Exports,
    meta: {
      kicker: "Stage 4",
      title: "Package reproducible bundles",
      description: "Queue download-ready artifacts for offline inspection or downstream analysis.",
    },
  },
  about: {
    component: About,
    meta: {
      kicker: "Reference",
      title: "Scientific scope and limits",
      description: "Review the assumptions and intended use boundaries behind the interface.",
    },
  },
};

const WORKFLOW_NAV = [
  ["#/", "Home", "home"],
  ["#/stimuli", "Stimuli", "stimuli"],
  ["#/runs", "Runs", "runs"],
  ["#/compare", "Compare", "compare"],
  ["#/exports", "Export", "exports"],
];

const SUPPORT_NAV = [["#/about", "About", "about"]];

export default function App() {
  const { route, params } = useHash();
  const current = ROUTES[route] ?? ROUTES.home;
  const Page = current.component;
  const { meta } = current;

  return (
    <div className="app-shell">
      <header className="shell-header">
        <div className="shell-header__inner">
          <div className="brand-lockup">
            <p className="eyebrow">TRIBE v2 research workspace</p>
            <a href="#/" className="brand-lockup__title">virtual-subject</a>
            <p className="brand-lockup__copy">
              A guided interface for generating, viewing, comparing, and exporting predicted cortical responses.
            </p>
          </div>

          <div className="shell-header__aside">
            <div className="shell-context">
              <p className="shell-context__kicker">{meta.kicker}</p>
              <p className="shell-context__title">{meta.title}</p>
              <p className="shell-context__desc">{meta.description}</p>
            </div>

            <nav className="main-nav" id="main-nav" aria-label="Primary navigation">
              <div className="main-nav__group">
                {WORKFLOW_NAV.map(([href, label, key]) => (
                  <a key={key} href={href} className={route === key ? "active-link" : ""}>
                    {label}
                  </a>
                ))}
              </div>
              <div className="main-nav__group main-nav__group--support">
                {SUPPORT_NAV.map(([href, label, key]) => (
                  <a key={key} href={href} className={route === key ? "active-link" : ""}>
                    {label}
                  </a>
                ))}
              </div>
            </nav>
          </div>
        </div>
      </header>

      <main className="app-main">
        <Page params={params} />
      </main>
    </div>
  );
}
