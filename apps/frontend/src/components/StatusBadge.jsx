const CLASS = {
  queued:           "badge--queued",
  processing:       "badge--processing",
  succeeded:        "badge--succeeded",
  failed:           "badge--failed",
  ready:            "badge--ready",
  pending:          "badge--pending",
  pending_finalize: "badge--queued",
  draft:            "badge--draft",
};

export default function StatusBadge({ status }) {
  if (!status) return null;
  return <span className={`badge ${CLASS[status] ?? ""}`}>{status}</span>;
}
