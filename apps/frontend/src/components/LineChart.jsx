export default function LineChart({ values, width = 520, height = 160 }) {
  if (!values?.length) return null;
  const padding = 18;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0;
  const points = values
    .map((v, i) => {
      const x = padding + i * step;
      const y = height - padding - ((v - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <div className="chart-box">
      <svg viewBox={`0 0 ${width} ${height}`} className="spark-svg" role="img" aria-label="Trace chart">
        <defs>
          <linearGradient id="chart-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00ffcc" />
            <stop offset="100%" stopColor="#3ef082" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={width} height={height} rx="12" />
        <polyline points={points} />
      </svg>
    </div>
  );
}
