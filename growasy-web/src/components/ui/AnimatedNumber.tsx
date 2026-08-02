import { useCountUp } from '@/hooks/use-count-up';

/** A number that counts up on mount / when the value changes. */
export function AnimatedNumber({
  value,
  className = '',
  format,
  duration,
}: {
  value: number;
  className?: string;
  format?: (n: number) => string;
  duration?: number;
}) {
  const v = useCountUp(value, { duration });
  const n = Math.round(v);
  return <span className={`tabular-nums ${className}`}>{format ? format(n) : n.toLocaleString()}</span>;
}
