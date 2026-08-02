import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bot,
  Check,
  Instagram,
  Link2,
  Rocket,
  Send,
  Workflow,
  X,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { PageTransition } from '@/components/ui/PageTransition';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { Sparkline } from '@/components/ui/Sparkline';
import { instagramApi } from '@/lib/instagram-api';
import { automationsApi } from '@/lib/automations-api';
import { organizationsApi } from '@/lib/organizations-api';
import { analyticsApi } from '@/lib/analytics-api';

const ONBOARDING_DISMISS_KEY = 'automiq-onboarding-dismissed';

/** Friendly label + dot colour per automation outcome. */
const OUTCOME_META: Record<string, { label: string; dot: string }> = {
  dm_sent: { label: 'DM sent', dot: 'bg-green-500' },
  reply_sent: { label: 'Comment replied', dot: 'bg-green-500' },
  lead_captured: { label: 'Email captured', dot: 'bg-emerald-500' },
  matched: { label: 'Matched', dot: 'bg-brand-500' },
  workflow_started: { label: 'Workflow started', dot: 'bg-brand-500' },
  rate_limited: { label: 'Rate-limited', dot: 'bg-amber-500' },
  plan_limit_reached: { label: 'Monthly limit reached', dot: 'bg-amber-500' },
  unsubscribed: { label: 'Skipped — unsubscribed', dot: 'bg-slate-400' },
  opted_out: { label: 'Contact opted out', dot: 'bg-slate-400' },
  needs_reconnect: { label: 'Account needs reconnect', dot: 'bg-red-500' },
  failed: { label: 'Failed', dot: 'bg-red-500' },
};

function outcomeMeta(outcome: string | null) {
  return (outcome && OUTCOME_META[outcome]) || { label: outcome ?? 'Processed', dot: 'bg-slate-300' };
}

function ago(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const QUICK_ACTIONS = [
  { to: '/instagram/accounts', label: 'Connect Instagram', hint: 'Link an account', icon: Instagram },
  { to: '/automations', label: 'New automation', hint: 'Comment → DM', icon: Bot },
  { to: '/workflows', label: 'Build a workflow', hint: 'Visual flow', icon: Workflow },
  { to: '/links', label: 'Create a link', hint: 'Trackable URL', icon: Link2 },
];

function fmtLimit(n: number): string {
  return n < 0 ? '∞' : n.toLocaleString();
}

function StatCard({
  icon: Icon,
  label,
  used,
  limit,
  sparkPoints,
}: {
  icon: typeof Send;
  label: string;
  used: number;
  limit: number;
  sparkPoints?: number[];
}) {
  return (
    <Card className="card-hover">
      <CardContent className="flex items-center gap-4 py-5">
        <ProgressRing value={used} max={limit} size={52} stroke={5}>
          <Icon className="h-4 w-4 text-brand-600 dark:text-brand-300" />
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <p className="mt-0.5 font-display text-2xl font-bold text-slate-900 dark:text-white">
            <AnimatedNumber value={used} />
            <span className="ml-1 text-sm font-medium text-slate-400">/ {fmtLimit(limit)}</span>
          </p>
        </div>
        {sparkPoints && sparkPoints.length > 1 ? (
          <Sparkline points={sparkPoints} className="h-8 w-20 shrink-0" />
        ) : null}
      </CardContent>
    </Card>
  );
}

export function DashboardHome() {
  const user = useAuthStore((s) => s.user);
  const organizations = useAuthStore((s) => s.organizations);
  const activeOrganizationId = useAuthStore((s) => s.activeOrganizationId);
  const activeOrg = organizations.find((o) => o.id === activeOrganizationId);

  const { data: accounts, isLoading, isError } = useQuery({
    queryKey: ['instagram', 'accounts'],
    queryFn: instagramApi.listAccounts,
  });
  const { data: rules } = useQuery({
    queryKey: ['automations', 'rules'],
    queryFn: () => automationsApi.list(),
  });
  const { data: usage } = useQuery({
    queryKey: ['organizations', 'usage'],
    queryFn: organizationsApi.getUsage,
  });
  const { data: overview } = useQuery({
    queryKey: ['analytics', 'overview', 30],
    queryFn: () => analyticsApi.overview(30),
  });
  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ['automations', 'activity'],
    queryFn: () => automationsApi.activity(15),
    refetchInterval: 30_000,
  });

  const connectedCount = accounts?.filter((a) => a.status === 'CONNECTED').length ?? 0;
  const dmSparkline = overview?.dmsPerDay?.map((d) => d.count) ?? [];

  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(ONBOARDING_DISMISS_KEY) === '1',
  );
  const steps = [
    {
      label: 'Connect an Instagram account',
      hint: 'Link your business/creator account — no Facebook Page needed.',
      done: connectedCount > 0,
      to: '/instagram/accounts',
      icon: Instagram,
    },
    {
      label: 'Create your first automation',
      hint: 'Auto-reply to a comment and DM your link.',
      done: (rules?.length ?? 0) > 0,
      to: '/automations',
      icon: Bot,
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  const showOnboarding = !dismissed && !allDone && !isLoading;

  const dismiss = () => {
    localStorage.setItem(ONBOARDING_DISMISS_KEY, '1');
    setDismissed(true);
  };

  return (
    <PageTransition>
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Welcome back{user ? `, ${user.firstName}` : ''} 👋
        </h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">
          {activeOrg
            ? `Here's what's happening in ${activeOrg.name}.`
            : "You're not part of an organization yet."}
        </p>

        {/* Quick actions */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {QUICK_ACTIONS.map((a, i) => (
            <motion.div
              key={a.to}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.05, ease: 'easeOut' }}
            >
              <Link
                to={a.to}
                className="card-hover focus-ring group flex h-full flex-col justify-between gap-6 rounded-2xl border border-slate-200/80 bg-white/80 p-4 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04]"
              >
                <span className="brand-gradient flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-glow">
                  <a.icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="flex items-center gap-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {a.label}
                    <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{a.hint}</span>
                </span>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* KPI stats */}
        {usage ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <StatCard icon={Instagram} label="IG accounts" used={usage.accountsUsed} limit={usage.accountsLimit} />
            <StatCard icon={Bot} label="Active automations" used={usage.activeRulesUsed} limit={usage.activeRulesLimit} />
            <StatCard icon={Send} label="DMs this month" used={usage.dmsUsedThisMonth} limit={usage.dmsLimit} sparkPoints={dmSparkline} />
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[92px] w-full rounded-2xl" />
            ))}
          </div>
        )}

        {showOnboarding ? (
          <Card className="mt-6 overflow-hidden">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200/70 bg-gradient-to-br from-brand-50 to-fuchsia-50 px-6 py-4 dark:border-white/10 dark:from-brand-950/40 dark:to-fuchsia-950/30">
              <div className="flex items-center gap-3">
                <ProgressRing value={doneCount} max={steps.length} size={42} stroke={4}>
                  <span className="brand-gradient flex h-6 w-6 items-center justify-center rounded-lg text-white">
                    <Rocket className="h-3.5 w-3.5" />
                  </span>
                </ProgressRing>
                <div>
                  <p className="font-display font-bold text-slate-900 dark:text-white">Get set up in 2 steps</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{doneCount} of {steps.length} done</p>
                </div>
              </div>
              <button
                type="button"
                onClick={dismiss}
                aria-label="Dismiss"
                className="focus-ring rounded-md p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <CardContent className="divide-y divide-slate-100 py-0 dark:divide-slate-800">
              {steps.map((step) => (
                <div key={step.label} className="flex items-center gap-3 py-3">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
                      step.done
                        ? 'bg-green-500 text-white'
                        : 'border-2 border-slate-300 text-slate-400 dark:border-slate-600'
                    }`}
                  >
                    {step.done ? <Check className="h-4 w-4" /> : <step.icon className="h-3.5 w-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium ${step.done ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}`}
                    >
                      {step.label}
                    </p>
                    {!step.done ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">{step.hint}</p>
                    ) : null}
                  </div>
                  {!step.done ? (
                    <Link
                      to={step.to}
                      className="focus-ring shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 active:scale-95"
                    >
                      Start
                    </Link>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {/* Recent automation activity */}
        <Card className="mt-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>What your automations have been doing.</CardDescription>
            </div>
            <Link
              to="/analytics"
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
            >
              <BarChart3 className="h-4 w-4" /> Analytics
            </Link>
          </CardHeader>
          <CardContent>
            {isError ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Could not load activity right now.</p>
            ) : activityLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : !activity || activity.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-500 dark:bg-brand-950 dark:text-brand-300">
                  <Send className="h-5 w-5" />
                </span>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No activity yet — once your automations run, you'll see them here.
                </p>
                <Link to="/automations">
                  <span className="focus-ring mt-1 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
                    Create an automation <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {activity.map((e, i) => {
                  const meta = outcomeMeta(e.outcome);
                  return (
                    <motion.li
                      key={e.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.22, delay: Math.min(i * 0.03, 0.3), ease: 'easeOut' }}
                      className="flex items-center gap-3 py-2.5 text-sm"
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
                      <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">
                        <span className="font-medium">{meta.label}</span>
                        {e.contactUsername ? (
                          <span className="text-slate-500 dark:text-slate-400"> · @{e.contactUsername}</span>
                        ) : null}
                        {e.ruleName ? <span className="text-slate-400"> · {e.ruleName}</span> : null}
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">{ago(e.createdAt)}</span>
                    </motion.li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
