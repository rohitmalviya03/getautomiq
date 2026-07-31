import { useState } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Lock,
  MessageSquare,
  Send,
  Target,
  Users,
} from 'lucide-react';
import { PageTransition } from '@/components/ui/PageTransition';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { analyticsApi } from '@/lib/analytics-api';
import { organizationsApi } from '@/lib/organizations-api';
import { instagramApi } from '@/lib/instagram-api';
import { planRank, PLAN_RANK } from '@/lib/plans';
import type { AnalyticsOverview, InstagramMedia } from '@/types/api';

// Single brand hue for every data mark (no categorical palette → no CVD concern).
const HUE = '#8232d6';

const RANGES = [7, 30, 90] as const;

const OUTCOME_LABELS: Record<string, string> = {
  dm_sent: 'DM sent',
  matched: 'Matched (queued)',
  no_match: 'No keyword match',
  rate_limited: 'Rate limited',
  plan_limit_reached: 'Plan limit reached',
  failed: 'Failed',
  needs_reconnect: 'Needs reconnect',
  self_comment: 'Own comment',
  no_account: 'No account',
  duplicate: 'Duplicate',
  unknown: 'Unknown',
};

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Send;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
          <Icon className="h-4 w-4" />
          <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        </div>
        <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
        {sub ? <p className="mt-0.5 text-xs text-slate-400">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}

/** Brand-hue area chart of DMs/day. 2px line, gradient fill, recessive gridlines. */
function DmsAreaChart({ data }: { data: AnalyticsOverview['dmsPerDay'] }) {
  const W = 640;
  const H = 160;
  const PAD = 10;
  const n = data.length;
  const max = Math.max(1, ...data.map((d) => d.count));
  const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);

  const line = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.count).toFixed(1)}`)
    .join(' ');
  const area = `${line} L${x(n - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" preserveAspectRatio="none" role="img">
        <defs>
          <linearGradient id="dmFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={HUE} stopOpacity="0.32" />
            <stop offset="100%" stopColor={HUE} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* recessive gridlines */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1="0"
            x2={W}
            y1={H - PAD - f * (H - PAD * 2)}
            y2={H - PAD - f * (H - PAD * 2)}
            className="stroke-slate-200 dark:stroke-slate-800"
            strokeWidth="1"
          />
        ))}
        <path d={area} fill="url(#dmFill)" />
        <path
          d={line}
          fill="none"
          stroke={HUE}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* hover targets (native tooltip) */}
        {data.map((d, i) => (
          <circle key={d.date} cx={x(i)} cy={y(d.count)} r="6" fill="transparent">
            <title>{`${d.date}: ${d.count} DM${d.count === 1 ? '' : 's'}`}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-slate-400">
        <span>{data[0]?.date}</span>
        <span>peak {max}</span>
        <span>{data[n - 1]?.date}</span>
      </div>
    </div>
  );
}

/** Horizontal bar list — single hue, rounded ends, value + native tooltip. */
function BarList({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3 text-sm">
          <span
            className="w-36 shrink-0 truncate text-slate-600 dark:text-slate-300"
            title={r.label}
          >
            {r.label}
          </span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full"
              style={{ width: `${(r.value / max) * 100}%`, backgroundColor: HUE }}
              title={`${r.value}`}
            />
          </div>
          <span className="w-10 shrink-0 text-right font-medium tabular-nums text-slate-700 dark:text-slate-200">
            {r.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsPage() {
  const [days, setDays] = useState<number>(30);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['analytics', 'overview', days],
    queryFn: () => analyticsApi.overview(days),
  });

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Analytics</h1>
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              How your comment-to-DM automations are performing.
            </p>
          </div>
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-600">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setDays(r)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  days === r
                    ? 'bg-brand-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {r}d
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
            <Skeleton className="h-56 w-full" />
          </div>
        ) : isError || !data ? (
          <Card>
            <CardContent>
              <p className="text-sm text-red-600 dark:text-red-400">Could not load analytics.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* KPI tiles */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                icon={Send}
                label="DMs sent"
                value={data.totals.dmsSent}
                sub={`in the last ${data.rangeDays} days`}
              />
              <StatTile
                icon={Target}
                label="Match rate"
                value={pct(data.totals.matchRate)}
                sub={`${data.totals.matched} of ${data.totals.commentsProcessed} comments`}
              />
              <StatTile
                icon={MessageSquare}
                label="Delivery rate"
                value={pct(data.totals.dmDeliveryRate)}
                sub="DMs sent / matched"
              />
              <StatTile
                icon={Users}
                label="Contacts"
                value={data.totals.contactsReached}
                sub="total leads captured"
              />
            </div>

            {/* DMs over time */}
            <Card>
              <CardHeader>
                <CardTitle>DMs sent over time</CardTitle>
              </CardHeader>
              <CardContent>
                {data.dmsPerDay.every((d) => d.count === 0) ? (
                  <p className="py-8 text-center text-sm text-slate-400">
                    No DMs sent in this period yet.
                  </p>
                ) : (
                  <DmsAreaChart data={data.dmsPerDay} />
                )}
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Outcome breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle>Outcome breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.outcomeBreakdown.length === 0 ? (
                    <p className="py-6 text-center text-sm text-slate-400">No events yet.</p>
                  ) : (
                    <BarList
                      rows={data.outcomeBreakdown.map((o) => ({
                        label: OUTCOME_LABELS[o.outcome] ?? o.outcome,
                        value: o.count,
                      }))}
                    />
                  )}
                </CardContent>
              </Card>

              {/* Top rules */}
              <Card>
                <CardHeader>
                  <CardTitle>Top automations</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.topRules.length === 0 ? (
                    <EmptyState
                      icon={BarChart3}
                      title="No DMs yet"
                      description="Your best-performing rules will rank here."
                    />
                  ) : (
                    <BarList
                      rows={data.topRules.map((r) => ({ label: r.name, value: r.dmsSent }))}
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}

        <PostAnalyticsSection days={days} />
      </div>
    </PageTransition>
  );
}

/** Per-post / per-reel automation performance — gated to Starter (₹149) & above. */
function PostAnalyticsSection({ days }: { days: number }) {
  const usageQuery = useQuery({
    queryKey: ['organizations', 'usage'],
    queryFn: organizationsApi.getUsage,
  });
  const rank = usageQuery.data ? planRank(usageQuery.data.planName) : Infinity;
  const canAccess = rank >= PLAN_RANK.STARTER;

  const postsQuery = useQuery({
    queryKey: ['analytics', 'posts', days],
    queryFn: () => analyticsApi.posts(days),
    enabled: canAccess,
  });
  const posts = postsQuery.data?.posts ?? [];

  // Enrich each post with its thumbnail/permalink from the account's media.
  const accountIds = [...new Set(posts.map((p) => p.instagramAccountId))];
  const mediaQueries = useQueries({
    queries: accountIds.map((id) => ({
      queryKey: ['instagram', 'media', id],
      queryFn: () => instagramApi.listMedia(id),
      staleTime: 5 * 60 * 1000,
    })),
  });
  const mediaMap = new Map<string, InstagramMedia>();
  mediaQueries.forEach((q) => (q.data ?? []).forEach((m) => mediaMap.set(m.id, m)));

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Post performance</CardTitle>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            How each post &amp; reel your automations run on is doing.
          </p>
        </div>
        <span className="shrink-0 rounded-md bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
          Starter+
        </span>
      </CardHeader>
      <CardContent>
        {!usageQuery.data ? (
          <Skeleton className="h-24 w-full" />
        ) : !canAccess ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 py-8 text-center dark:border-white/10 dark:bg-white/[0.03]">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-100 text-brand-600 dark:bg-brand-950 dark:text-brand-300">
              <Lock className="h-5 w-5" />
            </span>
            <p className="max-w-xs text-sm text-slate-600 dark:text-slate-300">
              Post-wise analytics is available on <strong>Starter</strong> and above.
            </p>
            <Link to="/billing">
              <Button size="sm">Upgrade plan</Button>
            </Link>
          </div>
        ) : postsQuery.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <EmptyState
            icon={ImageIcon}
            title="No post-level activity yet"
            description="Once an automation runs on a specific post or reel, its stats show up here."
          />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {posts.map((p) => {
              const media = mediaMap.get(p.mediaId);
              const isReel =
                media?.mediaProductType === 'REELS' || media?.mediaType === 'VIDEO';
              return (
                <li key={p.mediaId} className="flex items-center gap-3 py-3">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
                    {media?.thumbnailUrl ? (
                      <img
                        src={media.thumbnailUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-slate-400">
                        <ImageIcon className="h-5 w-5" />
                      </div>
                    )}
                    {isReel ? (
                      <span className="absolute right-0.5 top-0.5 rounded bg-black/60 p-0.5 text-white">
                        <Film className="h-3 w-3" />
                      </span>
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                      {media?.caption?.trim() || p.ruleNames[0] || `Post ${p.mediaId.slice(-6)}`}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {p.ruleNames.length ? p.ruleNames.join(', ') : 'Automation'} ·{' '}
                      {pct(p.matchRate)} match
                    </p>
                  </div>

                  <div className="hidden gap-5 text-right sm:flex">
                    <PostStat label="Comments" value={p.commentsProcessed} />
                    <PostStat label="Matched" value={p.matched} />
                    <PostStat label="DMs" value={p.dmsSent} />
                  </div>

                  {media?.permalink ? (
                    <a
                      href={media.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="focus-ring shrink-0 rounded-md p-1.5 text-slate-400 hover:text-brand-600"
                      aria-label="View post on Instagram"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function PostStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-sm font-semibold text-slate-900 dark:text-white">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}
