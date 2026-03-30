import useHash from "./hooks/useHash";
import Home from "./pages/Home";
import Stimuli from "./pages/Stimuli";
import Runs from "./pages/Runs";
import Compare from "./pages/Compare";
import Exports from "./pages/Exports";
import About from "./pages/About";

const ROUTES = {
  home: Home,
  stimuli: Stimuli,
  runs: Runs,
  compare: Compare,
  exports: Exports,
  about: About,
};

const NAV = [
  ["#/", "Home", "home"],
  ["#/stimuli", "Stimuli", "stimuli"],
  ["#/compare", "Compare", "compare"],
  ["#/exports", "Exports", "exports"],
  ["#/about", "About", "about"],
];

export default function App() {
  const { route, params } = useHash();
  const Page = ROUTES[route] ?? ROUTES.home;

  return (
    <>
      <header className="shell-header">
        <div>
          <p className="eyebrow">TRIBE v2 research MVP</p>
          <h1>virtual-subject</h1>
        </div>
        <nav id="main-nav">
          {NAV.map(([href, label, key]) => (
            <a key={key} href={href} className={route === key ? "active-link" : ""}>
              {label}
            </a>
          ))}
        </nav>
      </header>
      <main>
        <Page params={params} />
      </main>
    </>
  );
}
