export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`relative overflow-hidden rounded-md bg-slate-200 dark:bg-slate-800 ${className}`}
    >
      {/* Sweeping highlight — reads as "loading" more clearly than a plain pulse. */}
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/60 to-transparent motion-safe:animate-shimmer dark:via-white/10" />
    </div>
  );
}
