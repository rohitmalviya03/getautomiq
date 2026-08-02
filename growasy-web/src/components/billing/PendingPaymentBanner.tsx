import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/toast-context';
import { useAuthStore } from '@/stores/auth-store';
import { organizationsApi, type OrgUsage } from '@/lib/organizations-api';
import { billingApi } from '@/lib/billing-api';
import { loadRazorpay } from '@/lib/razorpay';
import { PLANS } from '@/lib/plans';
import { ApiError } from '@/lib/api-client';

/**
 * Shown across the dashboard when a paid plan was chosen at signup but not yet
 * paid for. Until then the org is on Free (paid features locked); this prompts
 * the owner to complete payment (or stay on Free). Renders nothing otherwise.
 */
export function PendingPaymentBanner() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [busy, setBusy] = useState(false);

  const usageQuery = useQuery<OrgUsage>({
    queryKey: ['organizations', 'usage'],
    queryFn: organizationsApi.getUsage,
  });
  const pendingTier = usageQuery.data?.pendingPlanTier ?? null;

  const dismiss = useMutation({
    mutationFn: () => billingApi.dismissPending(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['organizations', 'usage'] });
      showToast({ variant: 'info', title: 'Staying on the Free plan' });
    },
  });

  if (!pendingTier) return null;

  const plan = PLANS.find((p) => p.key === pendingTier);
  const planName = plan?.tag ?? pendingTier;
  const cycle = usageQuery.data?.pendingBillingCycle === 'yearly' ? 'yearly' : 'monthly';
  const priceLabel = plan ? (cycle === 'yearly' ? plan.priceYearly : plan.priceMonthly) : '';

  const payNow = async () => {
    const key = pendingTier as 'STARTER' | 'GROWTH' | 'PROFESSIONAL';
    setBusy(true);
    try {
      const order = await billingApi.checkout(key, cycle);
      const ready = await loadRazorpay();
      if (!ready || !window.Razorpay) {
        showToast({ variant: 'error', title: 'Couldn’t load the payment window' });
        setBusy(false);
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
        modal: { ondismiss: () => setBusy(false) },
        handler: async (resp) => {
          try {
            await billingApi.verify({ ...resp, plan: key, cycle });
            await queryClient.invalidateQueries({ queryKey: ['organizations', 'usage'] });
            showToast({ variant: 'success', title: `You’re on the ${planName} plan 🎉` });
          } catch {
            showToast({
              variant: 'error',
              title: 'Payment verification failed',
              description: 'If money was deducted it will be refunded, or contact support.',
            });
          } finally {
            setBusy(false);
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
      setBusy(false);
    }
  };

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/40 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-300">
            <CreditCard className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
              Complete your payment to activate the {planName} plan
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300/90">
              You’re on Free for now — {planName} features unlock once payment is received{priceLabel ? ` (${priceLabel}/${cycle === 'yearly' ? 'yr' : 'mo'})` : ''}.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || dismiss.isPending}
            onClick={() => dismiss.mutate()}
          >
            Stay on Free
          </Button>
          <Button variant="primary" size="sm" isLoading={busy} onClick={payNow}>
            <CreditCard className="h-4 w-4" /> Complete payment
          </Button>
        </div>
      </div>
    </div>
  );
}
