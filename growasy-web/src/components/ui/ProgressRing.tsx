import type { ReactNode } from 'react';

/**
 * Circular progress ring (brand hue). Animates the fill via a CSS transition on
 * stroke-dashoffset. Pass `max < 0` for "unlimited" — renders a faint full ring.
 */
export function ProgressRing({
  value,
  max,
  size = 46,
  stroke = 4,
  className = '',
  children,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  className?: string;
  children?: ReactNode;
}) {
  const unlimited = max < 0;
  const pct = unlimited ? 1 : max === 0 ? 0 : Math.min(1, Math.max(0, value / max));
  const near = !unlimited && pct >= 0.8;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);

  return (
    <div className={`relative inline-grid place-items-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-slate-200 dark:stroke-slate-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className={`transition-[stroke-dashoffset] duration-1000 ease-out ${
            unlimited ? 'stroke-brand-300/50' : near ? 'stroke-amber-500' : 'stroke-brand-500'
          }`}
        />
      </svg>
      {children ? <div className="absolute inset-0 grid place-items-center">{children}</div> : null}
    </div>
  );
}
