import { useEffect, useRef, useState } from 'react';

/**
 * Animates a number from its previous value up to `target` with an easeOutCubic
 * ramp. Honors `prefers-reduced-motion` (jumps straight to the value) so it stays
 * tasteful and accessible.
 */
export function useCountUp(target: number, opts?: { duration?: number; enabled?: boolean }): number {
  const duration = opts?.duration ?? 850;
  const enabled = opts?.enabled ?? true;
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | undefined>(undefined);
  const fromRef = useRef(0);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      setValue(target);
      fromRef.current = target;
      return;
    }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || duration <= 0) {
      setValue(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (target - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, enabled]);

  return value;
}
