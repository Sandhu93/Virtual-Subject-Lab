import { useState, useEffect } from "react";

function parseHash() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [pathPart, qs = ""] = raw.split("?");
  return {
    route: pathPart.replace(/^\/+/, "") || "home",
    params: new URLSearchParams(qs),
  };
}

export default function useHash() {
  const [loc, setLoc] = useState(parseHash);
  useEffect(() => {
    const handler = () => setLoc(parseHash());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  return loc;
}
