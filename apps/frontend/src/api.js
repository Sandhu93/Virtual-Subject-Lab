// Use a relative path so the nginx reverse proxy handles routing.
// This works both locally (nginx proxies /api/ → api:8000) and on RunPod
// (where each exposed port gets a different proxy hostname, making an
// absolute http://hostname:8000 URL unreachable from the browser).
export const API_BASE = `/api/v1`;

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers ?? {}),
    },
    ...options,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      detail = await res.text();
    }
    throw new Error(detail);
  }
  const ct = res.headers.get("content-type") ?? "";
  return ct.includes("application/json") ? res.json() : res.text();
}
