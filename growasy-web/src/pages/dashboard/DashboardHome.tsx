import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Bot, Check, Instagram, Rocket, X } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { PageTransition } from '@/components/ui/PageTransition';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { instagramApi } from '@/lib/instagram-api';
import { automationsApi } from '@/lib/automations-api';

const ONBOARDING_DISMISS_KEY = 'automiq-onboarding-dismissed';

/** Friendly label + dot colour per automation outcome. */
const OUTCOME_META: Record<string, { label: string; dot: string }> = {
  dm_sent: { label: 'DM sent', dot: 'bg-green-500' },
  reply_sent: { label: 'Comment replied', dot: 'bg-green-500' },
  lead_captured: { label: 'Email captured', dot: 'bg-emerald-500' },
  matched: { label: 'Matched', dot: 'bg-brand-500' },
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

export function DashboardHome() {
  const user = useAuthStore((s) => s.user);
  const organizations = useAuthStore((s) => s.organizations);
  const activeOrganizationId = useAuthStore((s) => s.activeOrganizationId);
  const activeOrg = organizations.find((o) => o.id === activeOrganizationId);

  const {
    data: accounts,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['instagram', 'accounts'],
    queryFn: instagramApi.listAccounts,
  });
  const { data: rules } = useQuery({
    queryKey: ['automations', 'rules'],
    queryFn: () => automationsApi.list(),
  });
  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ['automations', 'activity'],
    queryFn: () => automationsApi.activity(15),
    refetchInterval: 30_000,
  });

  const connectedCount = accounts?.filter((a) => a.status === 'CONNECTED').length ?? 0;

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
          Welcome back{user ? `, ${user.firstName}` : ''}
        </h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">
          {activeOrg
            ? `You're working in ${activeOrg.name}.`
            : "You're not part of an organization yet."}
        </p>

        {showOnboarding ? (
          <Card className="mt-6 overflow-hidden">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200/70 bg-gradient-to-br from-brand-50 to-fuchsia-50 px-6 py-4 dark:border-white/10 dark:from-brand-950/40 dark:to-fuchsia-950/30">
              <div className="flex items-center gap-3">
                <span className="brand-gradient flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-glow">
                  <Rocket className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-display font-bold text-slate-900 dark:text-white">
                    Get set up in 2 steps
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {doneCount} of {steps.length} done
                  </p>
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
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
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
                      className="focus-ring shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                    >
                      Start
                    </Link>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Connected accounts</CardTitle>
            <CardDescription>Instagram business accounts in this workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : isError ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Could not load your Instagram accounts right now.
              </p>
            ) : !accounts || accounts.length === 0 ? (
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
                    <Instagram className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    No Instagram accounts connected yet.
                  </p>
                </div>
                <Link
                  to="/instagram/accounts"
                  className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
                >
                  Connect your first Instagram account
                </Link>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
                    <Instagram className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                      {connectedCount}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      connected {connectedCount === 1 ? 'account' : 'accounts'}
                      {accounts.length > connectedCount
                        ? ` · ${accounts.length - connectedCount} needing attention`
                        : ''}
                    </p>
                  </div>
                </div>
                <Link
                  to="/instagram/accounts"
                  className="focus-ring inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                >
                  Manage accounts
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent automation activity */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>What your automations have been doing.</CardDescription>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : !activity || activity.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No activity yet — once your automations run, you&apos;ll see them here.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {activity.map((e) => {
                  const meta = outcomeMeta(e.outcome);
                  return (
                    <li key={e.id} className="flex items-center gap-3 py-2.5 text-sm">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
                      <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">
                        <span className="font-medium">{meta.label}</span>
                        {e.contactUsername ? (
                          <span className="text-slate-500 dark:text-slate-400"> · @{e.contactUsername}</span>
                        ) : null}
                        {e.ruleName ? (
                          <span className="text-slate-400"> · {e.ruleName}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">{ago(e.createdAt)}</span>
                    </li>
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
