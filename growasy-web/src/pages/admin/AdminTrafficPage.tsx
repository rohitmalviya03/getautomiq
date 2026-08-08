import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { adminApi, type TrafficBreakdownRow } from '@/lib/admin-api';

const RANGES = [7, 30, 90] as const;

/**
 * Chart palette. Two categorical slots, validated for both surfaces (lightness
 * band, chroma floor, CVD separation ΔE 24.7 protan, contrast ≥ 3:1). Declared
 * as custom properties under both the OS media query and the theme-toggle scope
 * so the toggle wins in either direction.
 */
const CHART_CSS = `
.viz-root {
  --series-views: #2a78d6;
  --series-visitors: #eb6834;
  --viz-grid: #e2e8f0;
  --viz-axis: #64748b;
  --viz-surface: #ffffff;
}
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) .viz-root {
    --series-views: #3987e5;
    --series-visitors: #d95926;
    --viz-grid: #334155;
    --viz-axis: #94a3b8;
    --viz-surface: #0f172a;
  }
}
:root[data-theme="dark"] .viz-root, .dark .viz-root {
  --series-views: #3987e5;
  --series-visitors: #d95926;
  --viz-grid: #334155;
  --viz-axis: #94a3b8;
  --viz-surface: #0f172a;
}
`;

function formatDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** Headline number. No sparkline here — the chart below already shows the shape. */
function StatTile({
  label,
  value,
  changePct,
  suffix,
}: {
  label: string;
  value: number;
  changePct?: number | null;
  suffix?: string;
}) {
  const up = (changePct ?? 0) >= 0;
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <p className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-white">
          {value.toLocaleString('en-IN')}
          {suffix ? <span className="text-base font-semibold text-slate-400"> {suffix}</span> : null}
        </p>
        {changePct === undefined ? null : changePct === null ? (
          <p className="mt-0.5 text-xs text-slate-400">no prior period</p>
        ) : (
          <p
            className={`mt-0.5 inline-flex items-center gap-1 text-xs font-medium ${
              up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            }`}
          >
            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(changePct)}% vs previous
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Ranked breakdown. A horizontal magnitude bar beats a pie: the labels are
 * readable, and lengths compare far more accurately than angles.
 */
function Breakdown({
  title,
  rows,
  emptyText,
}: {
  title: string;
  rows: TrafficBreakdownRow[];
  emptyText: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.views));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-4 text-sm text-slate-400">{emptyText}</p>
        ) : (
          <ul className="space-y-2.5">
            {rows.map((r) => (
              <li key={r.label}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-slate-700 dark:text-slate-200" title={r.label}>
                    {r.label}
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                    {r.views.toLocaleString('en-IN')}
                    <span className="text-slate-400"> · {r.visitors.toLocaleString('en-IN')} uv</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${Math.max(2, (r.views / max) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Visitor analytics for the platform owner.
 *
 * Counting is cookie-less: the server derives a visitor id from a daily-salted
 * hash of IP + user agent, so "unique visitors" is per-day and nobody is tracked
 * across days. "Signed-in users" is the honest cross-day number.
 */
export function AdminTrafficPage() {
  const [days, setDays] = useState<number>(30);

  const trafficQuery = useQuery({
    queryKey: ['admin', 'traffic', days],
    queryFn: () => adminApi.traffic(days),
  });
  const data = trafficQuery.data;

  return (
    <div className="viz-root space-y-5">
      <style>{CHART_CSS}</style>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Traffic</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Cookie-less analytics. Visitors are counted per day from a salted hash that rotates
            daily — nobody is followed across days.
          </p>
        </div>
        {/* Filters sit in one row above the charts. */}
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-white/10">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setDays(r)}
              className={`focus-ring rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                days === r
                  ? 'brand-gradient text-white'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      {trafficQuery.isLoading || !data ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-80 w-full rounded-2xl" />
        </div>
      ) : trafficQuery.isError ? (
        <p className="text-sm text-red-600">Could not load traffic.</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Unique visitors"
              value={data.totals.uniqueVisitors}
              changePct={data.trend.visitorsChangePct}
            />
            <StatTile
              label="Page views"
              value={data.totals.views}
              changePct={data.trend.viewsChangePct}
            />
            <StatTile label="Signed-in users" value={data.totals.signedInUsers} />
            <StatTile
              label="New workspaces"
              value={data.totals.signups}
              suffix={`· ${data.totals.signupRate}%`}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Views and unique visitors</CardTitle>
            </CardHeader>
            <CardContent>
              {data.daily.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">
                  No page views recorded yet in this range.
                </p>
              ) : (
                <>
                  {/* Legend: two series, so identity is never colour-alone. */}
                  <div className="mb-3 flex flex-wrap gap-4 text-xs font-medium text-slate-600 dark:text-slate-300">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-0.5 w-4 rounded-full"
                        style={{ background: 'var(--series-views)' }}
                      />
                      Page views
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-0.5 w-4 rounded-full"
                        style={{ background: 'var(--series-visitors)' }}
                      />
                      Unique visitors
                    </span>
                  </div>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      {/* One y-axis: both series are counts of the same unit. */}
                      <LineChart data={data.daily} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--viz-grid)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="day"
                          tickFormatter={formatDay}
                          tick={{ fontSize: 11, fill: 'var(--viz-axis)' }}
                          tickLine={false}
                          axisLine={false}
                          minTickGap={24}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fontSize: 11, fill: 'var(--viz-axis)' }}
                          tickLine={false}
                          axisLine={false}
                          width={48}
                        />
                        <Tooltip
                          cursor={{ stroke: 'var(--viz-axis)', strokeWidth: 1 }}
                          labelFormatter={(d) => formatDay(String(d))}
                          contentStyle={{
                            background: 'var(--viz-surface)',
                            border: '1px solid var(--viz-grid)',
                            borderRadius: 10,
                            fontSize: 12,
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="views"
                          name="Page views"
                          stroke="var(--series-views)"
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--viz-surface)' }}
                        />
                        <Line
                          type="monotone"
                          dataKey="visitors"
                          name="Unique visitors"
                          stroke="var(--series-visitors)"
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--viz-surface)' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Breakdown
              title="Top pages"
              rows={data.topPages}
              emptyText="No page views yet."
            />
            <Breakdown
              title="Top referrers"
              rows={data.topReferrers}
              emptyText="No external referrers yet — all traffic is direct."
            />
            <Breakdown title="Devices" rows={data.devices} emptyText="No device data yet." />
            <Breakdown
              title="Public site vs app"
              rows={data.bySurface}
              emptyText="No traffic yet."
            />
          </div>
        </>
      )}
    </div>
  );
}
