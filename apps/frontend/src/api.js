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
  const ct = res.headers.get("content-type") ?? "";
  const raw = await res.text();
  if (!res.ok) {
    let detail = res.statusText;
    if (raw) {
      if (ct.includes("application/json")) {
        try {
          const payload = JSON.parse(raw);
          detail = payload?.detail ?? payload?.message ?? raw;
        } catch {
          detail = raw;
        }
      } else {
        detail = raw;
      }
    }
    throw new Error(detail);
  }
  if (!raw) {
    return null;
  }
  return ct.includes("application/json") ? JSON.parse(raw) : raw;
}
