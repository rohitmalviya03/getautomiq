/**
 * Tiny single-hue sparkline (area + line) for stat tiles. Purely decorative —
 * uses the brand hue via `currentColor` on the wrapper. Draws in on mount.
 */
export function Sparkline({
  points,
  width = 96,
  height = 28,
  className = '',
  strokeWidth = 1.75,
}: {
  points: number[];
  width?: number;
  height?: number;
  className?: string;
  strokeWidth?: number;
}) {
  if (!points || points.length < 2) return null;

  const pad = 2;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const n = points.length;
  const x = (i: number) => pad + (i / (n - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / range) * (height - pad * 2);

  const line = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(n - 1).toFixed(1)},${height} L${x(0).toFixed(1)},${height} Z`;
  const uid = `spark-${Math.round(x(n - 1))}-${points.length}-${Math.round(max)}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`overflow-visible text-brand-500 ${className}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${uid})`} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className="[stroke-dasharray:240] [stroke-dashoffset:240] motion-safe:animate-dash"
      />
    </svg>
  );
}
