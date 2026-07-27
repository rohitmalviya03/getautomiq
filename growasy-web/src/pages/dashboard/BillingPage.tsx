import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Sparkles } from 'lucide-react';
import { PageTransition } from '@/components/ui/PageTransition';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/toast-context';
import { useAuthStore } from '@/stores/auth-store';
import { organizationsApi, type OrgUsage } from '@/lib/organizations-api';
import { PLANS, DM_ADDONS, SALES_EMAIL, type Plan } from '@/lib/plans';
import { billingApi } from '@/lib/billing-api';
import { loadRazorpay } from '@/lib/razorpay';
import { ApiError } from '@/lib/api-client';

function fmt(n: number): string {
  return n < 0 ? '∞' : n.toLocaleString();
}

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const unlimited = limit < 0;
  const pct = unlimited ? 8 : Math.min(100, limit === 0 ? 0 : Math.round((used / limit) * 100));
  const near = !unlimited && pct >= 80;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-800 dark:text-slate-100">{fmt(used)}</span>
          {' / '}
          {unlimited ? 'Unlimited' : fmt(limit)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={`h-full rounded-full ${near ? 'bg-amber-500' : 'brand-gradient'}`}
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </div>
    </div>
  );
}

export function BillingPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [yearly, setYearly] = useState(false);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const usageQuery = useQuery<OrgUsage>({
    queryKey: ['organizations', 'usage'],
    queryFn: organizationsApi.getUsage,
  });
  const usage = usageQuery.data;
  const currentPlan = usage?.planName ?? null;

  const startCheckout = async (plan: Plan) => {
    const key = plan.key as 'STARTER' | 'GROWTH';
    const cycle = yearly ? 'yearly' : 'monthly';
    setBusyPlan(plan.key);
    try {
      const order = await billingApi.checkout(key, cycle);
      const ready = await loadRazorpay();
      if (!ready || !window.Razorpay) {
        showToast({ variant: 'error', title: 'Couldn’t load the payment window' });
        setBusyPlan(null);
        return;
      }
      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: 'Automiq',
        description: `${order.planName} · ${cycle}`,
        prefill: {
          name: user ? `${user.firstName} ${user.lastName}`.trim() : undefined,
          email: user?.email,
        },
        theme: { color: '#8232d6' },
        modal: { ondismiss: () => setBusyPlan(null) },
        handler: async (resp) => {
          try {
            await billingApi.verify({ ...resp, plan: key, cycle });
            await queryClient.invalidateQueries({ queryKey: ['organizations', 'usage'] });
            showToast({ variant: 'success', title: `You’re on the ${plan.tag} plan 🎉` });
          } catch {
            showToast({
              variant: 'error',
              title: 'Payment verification failed',
              description: 'If money was deducted it will be refunded, or contact support.',
            });
          } finally {
            setBusyPlan(null);
          }
        },
      });
      rzp.open();
    } catch (e) {
      showToast({
        variant: 'error',
        title: 'Checkout failed',
        description: e instanceof ApiError ? e.message : 'Please try again.',
      });
      setBusyPlan(null);
    }
  };

  const onSelect = (plan: Plan) => {
    if (plan.tag === currentPlan) return;
    if (plan.key === 'STARTER' || plan.key === 'GROWTH') {
      void startCheckout(plan);
    } else {
      showToast({
        variant: 'info',
        title: 'Manage plan',
        description: `Contact support to switch to ${plan.tag}.`,
      });
    }
  };

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Plans &amp; billing
          </h1>
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            You’re on the{' '}
            <span className="font-semibold text-brand-600 dark:text-brand-300">
              {currentPlan ?? '—'}
            </span>{' '}
            plan. Upgrade any time as you grow.
          </p>
        </div>

        {/* Current usage */}
        <Card>
          <CardContent className="space-y-5 py-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                This month’s usage
              </h2>
              {currentPlan ? (
                <span className="brand-gradient rounded-full px-3 py-1 text-xs font-semibold text-white shadow-glow">
                  {currentPlan}
                </span>
              ) : null}
            </div>
            {usageQuery.isLoading || !usage ? (
              <div className="space-y-4">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-8 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-3">
                <UsageMeter
                  label="Instagram accounts"
                  used={usage.accountsUsed}
                  limit={usage.accountsLimit}
                />
                <UsageMeter
                  label="Active automations"
                  used={usage.activeRulesUsed}
                  limit={usage.activeRulesLimit}
                />
                <UsageMeter
                  label="DMs this month"
                  used={usage.dmsUsedThisMonth}
                  limit={usage.dmsLimit}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Billing period toggle */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setYearly(false)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                !yearly ? 'brand-gradient text-white shadow-glow' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setYearly(true)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                yearly ? 'brand-gradient text-white shadow-glow' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Yearly <span className="text-[11px] font-bold text-orange-500">–2 months</span>
            </button>
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => {
            const isCurrent = plan.tag === currentPlan;
            return (
              <div
                key={plan.tag}
                className={`relative flex flex-col rounded-2xl border bg-white/80 p-5 backdrop-blur-sm dark:bg-white/[0.04] ${
                  isCurrent
                    ? 'border-green-500 ring-2 ring-green-500/40'
                    : plan.popular
                      ? 'border-brand-400 ring-2 ring-brand-500/30'
                      : 'border-slate-200 dark:border-white/10'
                }`}
              >
                {isCurrent ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-green-500 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                    Current plan
                  </span>
                ) : plan.popular ? (
                  <span className="brand-gradient absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-glow">
                    <Sparkles className="h-3 w-3" /> Popular
                  </span>
                ) : null}

                <span className="font-display text-base font-bold text-slate-900 dark:text-white">
                  {plan.tag}
                </span>

                {plan.contactSales ? (
                  <>
                    <div className="mt-2">
                      <span className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                        Let’s talk
                      </span>
                    </div>
                    <p className="mt-0.5 min-h-[18px] text-xs text-slate-400">
                      Custom pricing &amp; limits
                    </p>
                    <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                      {plan.subtitle}
                    </p>
                    <a
                      href={`mailto:${SALES_EMAIL}?subject=Automiq%20Agency%20plan`}
                      className="mt-4 block"
                    >
                      <Button variant="secondary" className="w-full justify-center">
                        Contact Sales
                      </Button>
                    </a>
                    <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
                      Everything in Growth, plus white-label reports, unlimited team &amp;
                      workspaces, and premium support.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                        {yearly ? plan.priceYearly : plan.priceMonthly}
                      </span>
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        {plan.priceMonthly === '₹0' ? '' : yearly ? '/year' : '/month'}
                      </span>
                    </div>
                    <p className="mt-0.5 min-h-[18px] text-xs text-slate-400">
                      {plan.priceMonthly === '₹0'
                        ? 'Free forever'
                        : yearly
                          ? '2 months free · billed annually'
                          : 'Billed monthly'}
                    </p>
                    <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                      {plan.subtitle}
                    </p>

                    <Button
                      variant={isCurrent ? 'secondary' : plan.popular ? 'primary' : 'secondary'}
                      className="mt-4 w-full justify-center"
                      disabled={isCurrent || busyPlan !== null}
                      isLoading={busyPlan === plan.key}
                      onClick={() => onSelect(plan)}
                    >
                      {isCurrent ? 'Current plan' : plan.cta}
                    </Button>

                    <ul className="mt-5 space-y-2.5">
                      {plan.features.map((f) => (
                        <li
                          key={f}
                          className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300"
                        >
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Pay-as-you-go DM top-ups */}
        <Card>
          <CardContent className="py-5">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  Need more DMs?
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  One-time packs that stack on your plan and never expire.
                </p>
              </div>
              <span className="text-xs font-medium text-slate-400">Only pay for what you use</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {DM_ADDONS.map((a) => (
                <button
                  key={a.dms}
                  type="button"
                  onClick={() =>
                    showToast({
                      variant: 'info',
                      title: 'DM pack',
                      description: `${a.dms} DMs for ${a.price} — self-serve top-ups are coming soon.`,
                    })
                  }
                  className="focus-ring rounded-xl border border-slate-200 bg-slate-50 p-4 text-center transition-colors hover:border-brand-300 dark:border-white/10 dark:bg-white/[0.03]"
                >
                  <span className="block font-display text-xl font-bold text-slate-900 dark:text-white">
                    {a.dms}
                  </span>
                  <span className="mb-2 block text-[11px] uppercase tracking-wide text-slate-400">
                    DMs
                  </span>
                  <span className="brand-gradient-text block font-bold">{a.price}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <p className="pb-4 text-center text-xs text-slate-400">
          Prices in INR. No contact-based billing, no hidden charges — only pay for what you use.
        </p>
      </div>
    </PageTransition>
  );
}
