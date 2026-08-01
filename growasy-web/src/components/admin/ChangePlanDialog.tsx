import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Input';
import { useToast } from '@/components/ui/toast-context';
import { adminApi, type AdminCustomerDetail } from '@/lib/admin-api';
import { PLAN_TIERS, SUBSCRIPTION_STATUSES } from '@/pages/admin/admin-format';
import { ApiError } from '@/lib/api-client';

interface Props {
  open: boolean;
  customerId: string;
  subscription: AdminCustomerDetail['subscription'];
  onClose: () => void;
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

export function ChangePlanDialog({ open, customerId, subscription, onClose }: Props) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [tier, setTier] = useState(subscription?.plan.tier ?? 'FREE');
  const [status, setStatus] = useState(subscription?.status ?? 'ACTIVE');
  const [billingCycle, setBillingCycle] = useState(subscription?.billingCycle ?? 'MONTHLY');
  const [trialEndsAt, setTrialEndsAt] = useState(toDateInput(subscription?.trialEndsAt));
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(subscription?.cancelAtPeriodEnd ?? false);
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      adminApi.changePlan(customerId, {
        tier,
        status,
        billingCycle: billingCycle as 'MONTHLY' | 'YEARLY',
        trialEndsAt,
        cancelAtPeriodEnd,
        reason: reason || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'customer', customerId] });
      showToast({ variant: 'success', title: 'Plan updated' });
      onClose();
    },
    onError: (e) =>
      showToast({
        variant: 'error',
        title: 'Could not update plan',
        description: e instanceof ApiError ? e.message : 'Please try again.',
      }),
  });

  const selectClass =
    'focus-ring w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">Change plan</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Overrides this customer's subscription. The change is recorded in the audit log.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <Label htmlFor="tier">Plan tier</Label>
                <select id="tier" className={selectClass} value={tier} onChange={(e) => setTier(e.target.value)}>
                  {PLAN_TIERS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="status">Status</Label>
                  <select id="status" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
                    {SUBSCRIPTION_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="cycle">Billing cycle</Label>
                  <select
                    id="cycle"
                    className={selectClass}
                    value={billingCycle}
                    onChange={(e) => setBillingCycle(e.target.value)}
                  >
                    <option value="MONTHLY">MONTHLY</option>
                    <option value="YEARLY">YEARLY</option>
                  </select>
                </div>
              </div>

              <div>
                <Label htmlFor="trial">Trial ends at (optional)</Label>
                <Input id="trial" type="date" value={trialEndsAt} onChange={(e) => setTrialEndsAt(e.target.value)} />
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={cancelAtPeriodEnd}
                  onChange={(e) => setCancelAtPeriodEnd(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Cancel at period end
              </label>

              <div>
                <Label htmlFor="reason">Reason (optional)</Label>
                <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. comped for beta feedback" />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={onClose} disabled={mutation.isPending}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" isLoading={mutation.isPending} onClick={() => mutation.mutate()}>
                Save changes
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
