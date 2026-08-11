import { useQuery } from '@tanstack/react-query';
import { automationsApi } from '@/lib/automations-api';

/**
 * A/B results for an automation that has more than one message.
 *
 * The metric is email captures per send, not sends alone — a variant that went
 * out more often isn't a better variant. A leader is named only once each has
 * enough sends to mean something; before that this says so rather than crowning
 * noise, because acting on a 3-send "winner" is worse than not testing at all.
 */
export function VariantResults({ ruleId }: { ruleId: string }) {
  const statsQuery = useQuery({
    queryKey: ['automations', 'variants', ruleId],
    queryFn: () => automationsApi.variantStats(ruleId),
    staleTime: 60_000,
  });

  const stats = statsQuery.data;
  if (!stats?.running || stats.variants.length === 0) return null;

  // Bars are relative to the best rate, so small differences stay visible.
  const best = Math.max(...stats.variants.map((v) => v.captureRate ?? 0), 0);

  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-3 dark:border-white/15">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          A/B test
        </p>
        <p className="text-xs text-slate-400">
          {stats.leader
            ? `Variant ${stats.leader} is ahead`
            : `Too early to call · ${stats.totalSent ?? 0} sent`}
        </p>
      </div>

      <ul className="space-y-2">
        {stats.variants.map((v) => {
          const isLeader = stats.leader === v.id;
          return (
            <li key={v.id}>
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">
                  <strong className="mr-1.5 text-slate-800 dark:text-slate-100">{v.id}</strong>
                  {v.text}
                </span>
                <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                  {v.sent} sent · {v.captured} emails
                  {v.captureRate !== null ? ` · ${v.captureRate}%` : ''}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className={`h-full rounded-full ${isLeader ? 'bg-emerald-500' : 'bg-brand-400'}`}
                  style={{
                    width: `${best > 0 ? Math.max(2, ((v.captureRate ?? 0) / best) * 100) : 2}%`,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
