import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Sparkles, Info } from 'lucide-react';
import { PageTransition } from '@/components/ui/PageTransition';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/toast-context';
import { useAuthStore } from '@/stores/auth-store';
import { organizationsApi, type OrgUsage } from '@/lib/organizations-api';
import { SALES_EMAIL } from '@/lib/plans';
import {
  cycleOf,
  formatMoney,
  isFreePlan,
  usePlans,
  type PriceQuote,
  type PurchasableKey,
  type ServerPlan,
} from '@/lib/pricing-api';
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
  const cycle: 'monthly' | 'yearly' = yearly ? 'yearly' : 'monthly';

  // Admin-managed catalogue — prices, copy and any live promo come from here.
  const { data: plans = [] } = usePlans();

  // Coupon state. `couponQuotes` holds the server's verdict per purchasable tier
  // (a coupon can be restricted to some tiers), so the cards can show the real
  // discounted price instead of guessing at it client-side.
  const [couponInput, setCouponInput] = useState('');
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [couponQuotes, setCouponQuotes] = useState<Record<string, PriceQuote>>({});
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);

  const usageQuery = useQuery<OrgUsage>({
    queryKey: ['organizations', 'usage'],
    queryFn: organizationsApi.getUsage,
  });
  const usage = usageQuery.data;
  const currentPlan = usage?.planName ?? null;
  const isPaidPlan = currentPlan != null && currentPlan !== 'Free';

  const configQuery = useQuery({
    queryKey: ['billing', 'config'],
    queryFn: billingApi.config,
    staleTime: 5 * 60 * 1000,
  });
  const paymentsEnabled = configQuery.data?.enabled ?? false;
  const paymentsUnavailable = configQuery.isSuccess && !paymentsEnabled;

  const [cancelOpen, setCancelOpen] = useState(false);
  const cancelMutation = useMutation({
    mutationFn: () => billingApi.cancel(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['organizations', 'usage'] });
      setCancelOpen(false);
      showToast({ variant: 'success', title: 'Your plan won’t renew — you keep access until period end.' });
    },
    onError: (e) =>
      showToast({ variant: 'error', title: 'Could not cancel', description: e instanceof ApiError ? e.message : undefined }),
  });

  /**
   * Validates a code against every purchasable tier at once. A coupon can be
   * limited to certain tiers or cycles, so "does it apply?" is per-plan — and
   * the server is the only thing that gets to answer it.
   */
  const applyCoupon = async (rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    if (!code) return;
    setCouponBusy(true);
    setCouponError(null);
    const targets = plans.filter((p) => p.purchasable).map((p) => p.tier as PurchasableKey);
    const results = await Promise.allSettled(
      targets.map((tier) => billingApi.quote(tier, cycle, code)),
    );

    const accepted: Record<string, PriceQuote> = {};
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value.coupon) accepted[targets[i]] = r.value;
    });

    if (Object.keys(accepted).length === 0) {
      const firstError = results.find((r) => r.status === 'rejected') as
        | PromiseRejectedResult
        | undefined;
      const reason = firstError?.reason;
      setCouponError(reason instanceof ApiError ? reason.message : 'That code is not valid.');
      setAppliedCode(null);
      setCouponQuotes({});
      setCouponBusy(false);
      return;
    }

    setCouponQuotes(accepted);
    setAppliedCode(code);
    setCouponBusy(false);
    showToast({ variant: 'success', title: `Coupon ${code} applied` });
  };

  const clearCoupon = () => {
    setAppliedCode(null);
    setCouponQuotes({});
    setCouponError(null);
    setCouponInput('');
  };

  // A coupon's discount depends on the cycle, so re-validate when it flips.
  const onCycleChange = (nextYearly: boolean) => {
    setYearly(nextYearly);
    if (appliedCode) {
      const code = appliedCode;
      setCouponQuotes({});
      // Re-quote against the new cycle; the state update above already ran, so
      // read the cycle from the argument rather than the stale closure value.
      void (async () => {
        const targets = plans.filter((p) => p.purchasable).map((p) => p.tier as PurchasableKey);
        const results = await Promise.allSettled(
          targets.map((tier) =>
            billingApi.quote(tier, nextYearly ? 'yearly' : 'monthly', code),
          ),
        );
        const accepted: Record<string, PriceQuote> = {};
        results.forEach((r, i) => {
          if (r.status === 'fulfilled' && r.value.coupon) accepted[targets[i]] = r.value;
        });
        setCouponQuotes(accepted);
        if (Object.keys(accepted).length === 0) {
          setAppliedCode(null);
          setCouponError(`${code} doesn’t apply to ${nextYearly ? 'yearly' : 'monthly'} billing.`);
        }
      })();
    }
  };

  const startCheckout = async (plan: ServerPlan) => {
    const key = plan.tier as PurchasableKey;
    setBusyPlan(plan.tier);
    try {
      const order = await billingApi.checkout(key, cycle, appliedCode ?? undefined);

      // Discounts covered the whole price — the server already activated it.
      if (order.free) {
        await queryClient.invalidateQueries({ queryKey: ['organizations', 'usage'] });
        showToast({
          variant: 'success',
          title: `You’re on the ${order.planName} plan 🎉`,
          description: 'Your discount covered the full amount — nothing to pay.',
        });
        setBusyPlan(null);
        return;
      }

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
            showToast({
              variant: 'success',
              title: `You’re on the ${plan.tag} plan 🎉`,
              description: 'Your full monthly DM allowance is available right now.',
            });
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

  const onSelect = (plan: ServerPlan) => {
    if (plan.name === currentPlan) return;
    if (plan.purchasable) {
      // A 100%-off coupon activates server-side without touching Razorpay, so
      // it must not be blocked when card payments are switched off.
      const freeAfterDiscount = couponQuotes[plan.tier]?.free ?? false;
      if (!paymentsEnabled && !freeAfterDiscount) {
        showToast({
          variant: 'info',
          title: 'Online payments aren’t enabled yet',
          description: 'Card checkout is being set up — please contact support to upgrade in the meantime.',
        });
        return;
      }
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

        {paymentsUnavailable ? (
          <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900 dark:bg-sky-950">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" />
            <p className="text-sm text-sky-800 dark:text-sky-200">
              Online card payments aren’t enabled on this server yet. The plans below are ready — set the
              Razorpay keys to start collecting payments, or contact support to upgrade manually.
            </p>
          </div>
        ) : null}

        {/* Current usage */}
        <Card>
          <CardContent className="space-y-5 py-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                This month’s usage
              </h2>
              <div className="flex items-center gap-2">
                {isPaidPlan ? (
                  <Button variant="ghost" size="sm" onClick={() => setCancelOpen(true)}>
                    Cancel plan
                  </Button>
                ) : null}
                {currentPlan ? (
                  <span className="brand-gradient rounded-full px-3 py-1 text-xs font-semibold text-white shadow-glow">
                    {currentPlan}
                  </span>
                ) : null}
              </div>
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
            {usage ? (
              <p className="text-xs text-slate-400">
                Your DM quota resets on{' '}
                <span className="font-medium text-slate-500 dark:text-slate-300">
                  {new Date(usage.dmResetsAt).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
                . Upgrading gives you the new plan's full monthly allowance right away.
              </p>
            ) : null}
          </CardContent>
        </Card>

        {/* Billing period toggle */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => onCycleChange(false)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                !yearly ? 'brand-gradient text-white shadow-glow' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => onCycleChange(true)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                yearly ? 'brand-gradient text-white shadow-glow' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Yearly <span className="text-[11px] font-bold text-orange-500">–2 months</span>
            </button>
          </div>
        </div>

        {/* Discount code */}
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Have a discount code?
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Applied on top of any offer already running.
              </p>
            </div>
            {appliedCode ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-green-700 dark:text-green-300">
                  <Check className="h-3.5 w-3.5" /> {appliedCode}
                </span>
                <Button variant="ghost" size="sm" onClick={clearCoupon}>
                  Remove
                </Button>
              </div>
            ) : (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void applyCoupon(couponInput);
                }}
              >
                <input
                  value={couponInput}
                  onChange={(e) => {
                    setCouponInput(e.target.value.toUpperCase());
                    setCouponError(null);
                  }}
                  placeholder="ENTER CODE"
                  maxLength={40}
                  className="w-40 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold uppercase tracking-wide text-slate-800 placeholder:font-normal placeholder:tracking-normal focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100"
                />
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  isLoading={couponBusy}
                  disabled={!couponInput.trim()}
                >
                  Apply
                </Button>
              </form>
            )}
          </div>
          {couponError ? (
            <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{couponError}</p>
          ) : null}
        </div>

        {/* Plan cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {plans.map((plan) => {
            const isCurrent = plan.name === currentPlan;
            const price = cycleOf(plan, cycle);
            const quote = couponQuotes[plan.tier];
            // The coupon quote (when the code applies to this tier) is already the
            // final server-computed price; otherwise fall back to the plan promo.
            const payable = quote ? quote.amountDue : price.amountDue;
            const struckThrough = payable < price.listPrice ? price.listPrice : null;
            const free = isFreePlan(plan);
            return (
              <div
                key={plan.tier}
                className={`relative flex flex-col rounded-2xl border bg-white/80 p-5 backdrop-blur-sm dark:bg-white/[0.04] ${
                  isCurrent
                    ? 'border-green-500 ring-2 ring-green-500/40'
                    : plan.isPopular
                      ? 'border-brand-400 ring-2 ring-brand-500/30'
                      : 'border-slate-200 dark:border-white/10'
                }`}
              >
                {isCurrent ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-green-500 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                    Current plan
                  </span>
                ) : plan.isPopular ? (
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
                    <div className="mt-2 flex items-baseline gap-1.5">
                      {struckThrough ? (
                        <span className="text-base font-semibold text-slate-400 line-through dark:text-slate-500">
                          {formatMoney(struckThrough, plan.currency)}
                        </span>
                      ) : null}
                      <span className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                        {formatMoney(payable, plan.currency)}
                      </span>
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        {free ? '' : yearly ? '/year' : '/month'}
                      </span>
                    </div>
                    <p className="mt-0.5 min-h-[18px] text-xs text-slate-400">
                      {quote?.coupon ? (
                        <span className="font-semibold text-green-600 dark:text-green-400">
                          {appliedCode} · −{formatMoney(quote.coupon.amount, plan.currency)}
                        </span>
                      ) : price.discount > 0 && price.promoLabel ? (
                        <span className="font-semibold text-brand-600 dark:text-brand-300">
                          {price.promoLabel}
                        </span>
                      ) : free ? (
                        'Free forever'
                      ) : yearly ? (
                        '2 months free · billed annually'
                      ) : (
                        'Billed monthly'
                      )}
                    </p>
                    <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                      {plan.subtitle}
                    </p>

                    <Button
                      variant={isCurrent ? 'secondary' : plan.isPopular ? 'primary' : 'secondary'}
                      className="mt-4 w-full justify-center"
                      disabled={isCurrent || busyPlan !== null}
                      isLoading={busyPlan === plan.tier}
                      onClick={() => onSelect(plan)}
                    >
                      {isCurrent ? 'Current plan' : (plan.ctaLabel ?? 'Choose plan')}
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

        <p className="pb-4 text-center text-xs text-slate-400">
          Prices in INR. No contact-based billing, no hidden charges.
        </p>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        title="Cancel your plan?"
        description="You'll keep your current plan until the end of the paid period, then move to Free. No refund is issued for the remaining time."
        confirmLabel="Cancel at period end"
        cancelLabel="Keep my plan"
        variant="danger"
        isLoading={cancelMutation.isPending}
        onConfirm={() => cancelMutation.mutate()}
        onCancel={() => setCancelOpen(false)}
      />
    </PageTransition>
  );
}
