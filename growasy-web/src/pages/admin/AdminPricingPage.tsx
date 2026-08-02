import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IndianRupee, Percent, Save, Tag } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/toast-context';
import { ApiError } from '@/lib/api-client';
import { adminApi, type AdminPlanRow, type UpdatePlanInput } from '@/lib/admin-api';
import { formatMoney } from '@/lib/pricing-api';
import { inputCls, labelCls, toLocalInput, toPaise, toRupees, Toggle } from './pricing-ui';

interface Draft {
  name: string;
  tag: string;
  subtitle: string;
  ctaLabel: string;
  inheritsLabel: string;
  monthly: string;
  yearly: string;
  features: string;
  isPopular: boolean;
  isBestValue: boolean;
  contactSales: boolean;
  isPublic: boolean;
  isActive: boolean;
  sortOrder: string;
  maxInstagramAccounts: string;
  maxAutomations: string;
  maxMessagesPerMonth: string;
  maxTeamMembers: string;
  promoType: '' | 'PERCENT' | 'FLAT';
  promoValue: string;
  promoLabel: string;
  promoStartsAt: string;
  promoEndsAt: string;
}

function draftOf(plan: AdminPlanRow): Draft {
  return {
    name: plan.name,
    tag: plan.tag ?? '',
    subtitle: plan.subtitle ?? '',
    ctaLabel: plan.ctaLabel ?? '',
    inheritsLabel: plan.inheritsLabel ?? '',
    monthly: toRupees(plan.monthly.listPrice),
    yearly: toRupees(plan.yearly.listPrice),
    features: plan.features.join('\n'),
    isPopular: plan.isPopular,
    isBestValue: plan.isBestValue,
    contactSales: plan.contactSales,
    isPublic: plan.isPublic,
    isActive: plan.isActive,
    sortOrder: String(plan.sortOrder),
    maxInstagramAccounts: String(plan.limits?.maxInstagramAccounts ?? -1),
    maxAutomations: String(plan.limits?.maxAutomations ?? -1),
    maxMessagesPerMonth: String(plan.limits?.maxMessagesPerMonth ?? -1),
    maxTeamMembers: String(plan.limits?.maxTeamMembers ?? -1),
    promoType: plan.promoType ?? '',
    promoValue:
      plan.promoType === 'FLAT'
        ? toRupees(plan.promoValue ?? 0)
        : String(plan.promoValue ?? ''),
    promoLabel: plan.promoLabel ?? '',
    promoStartsAt: toLocalInput(plan.promoStartsAt),
    promoEndsAt: toLocalInput(plan.promoEndsAt),
  };
}

function PlanEditor({ plan }: { plan: AdminPlanRow }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => draftOf(plan));

  // Re-sync when the server copy changes (e.g. after another admin's save).
  useEffect(() => setDraft(draftOf(plan)), [plan]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = useMutation({
    mutationFn: () => {
      const body: UpdatePlanInput = {
        name: draft.name.trim(),
        tag: draft.tag.trim(),
        subtitle: draft.subtitle.trim(),
        ctaLabel: draft.ctaLabel.trim(),
        inheritsLabel: draft.inheritsLabel.trim(),
        monthlyPrice: toPaise(draft.monthly),
        yearlyPrice: toPaise(draft.yearly),
        features: draft.features
          .split('\n')
          .map((f) => f.trim())
          .filter(Boolean),
        isPopular: draft.isPopular,
        isBestValue: draft.isBestValue,
        contactSales: draft.contactSales,
        isPublic: draft.isPublic,
        isActive: draft.isActive,
        sortOrder: Number(draft.sortOrder || '0'),
        maxInstagramAccounts: Number(draft.maxInstagramAccounts),
        maxAutomations: Number(draft.maxAutomations),
        maxMessagesPerMonth: Number(draft.maxMessagesPerMonth),
        maxTeamMembers: Number(draft.maxTeamMembers),
        // An empty type clears the whole promo server-side.
        promoType: draft.promoType === '' ? null : draft.promoType,
        promoValue:
          draft.promoType === ''
            ? null
            : draft.promoType === 'FLAT'
              ? toPaise(draft.promoValue)
              : Number(draft.promoValue || '0'),
        promoLabel: draft.promoType === '' ? null : draft.promoLabel.trim(),
        promoStartsAt: draft.promoStartsAt ? new Date(draft.promoStartsAt).toISOString() : '',
        promoEndsAt: draft.promoEndsAt ? new Date(draft.promoEndsAt).toISOString() : '',
      };
      return adminApi.updatePlan(plan.id, body);
    },
    onSuccess: async () => {
      // Both the admin list and every storefront surface read these rows.
      await queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] });
      await queryClient.invalidateQueries({ queryKey: ['plans'] });
      showToast({ variant: 'success', title: `${draft.name} saved — live everywhere now` });
    },
    onError: (e) =>
      showToast({
        variant: 'error',
        title: 'Could not save',
        description: e instanceof ApiError ? e.message : undefined,
      }),
  });

  const promoOn = draft.promoType !== '';
  const monthlyPaise = toPaise(draft.monthly);
  const previewDiscount = promoOn
    ? draft.promoType === 'PERCENT'
      ? Math.round((monthlyPaise * Number(draft.promoValue || '0')) / 100)
      : toPaise(draft.promoValue)
    : 0;
  const previewFinal = Math.max(0, monthlyPaise - previewDiscount);

  return (
    <Card>
      <CardContent className="space-y-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="brand-gradient rounded-lg px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-white">
              {plan.tier}
            </span>
            <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              {draft.name}
            </h3>
            {!draft.isActive ? (
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold uppercase text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                Inactive
              </span>
            ) : null}
          </div>
          <Button size="sm" isLoading={save.isPending} onClick={() => save.mutate()}>
            <Save className="h-4 w-4" /> Save
          </Button>
        </div>

        {/* Pricing */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={labelCls}>Monthly (₹)</label>
            <input
              className={inputCls}
              type="number"
              min={0}
              step="1"
              value={draft.monthly}
              onChange={(e) => set('monthly', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Yearly (₹)</label>
            <input
              className={inputCls}
              type="number"
              min={0}
              step="1"
              value={draft.yearly}
              onChange={(e) => set('yearly', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Display name</label>
            <input
              className={inputCls}
              value={draft.tag}
              onChange={(e) => set('tag', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Order</label>
            <input
              className={inputCls}
              type="number"
              value={draft.sortOrder}
              onChange={(e) => set('sortOrder', e.target.value)}
            />
          </div>
        </div>

        {/* Copy */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Subtitle</label>
            <input
              className={inputCls}
              value={draft.subtitle}
              onChange={(e) => set('subtitle', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Button label</label>
            <input
              className={inputCls}
              value={draft.ctaLabel}
              onChange={(e) => set('ctaLabel', e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>“Everything in …” line</label>
            <input
              className={inputCls}
              value={draft.inheritsLabel}
              onChange={(e) => set('inheritsLabel', e.target.value)}
              placeholder="Everything in Starter, plus:"
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Features — one per line</label>
            <textarea
              className={`${inputCls} min-h-[140px] font-mono text-xs`}
              value={draft.features}
              onChange={(e) => set('features', e.target.value)}
            />
          </div>
        </div>

        {/* Limits */}
        <div>
          <p className={labelCls}>Limits — −1 means unlimited</p>
          <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ['maxInstagramAccounts', 'IG accounts'],
                ['maxAutomations', 'Automations'],
                ['maxMessagesPerMonth', 'DMs / month'],
                ['maxTeamMembers', 'Team seats'],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label className="text-xs text-slate-500 dark:text-slate-400">{label}</label>
                <input
                  className={inputCls}
                  type="number"
                  min={-1}
                  value={draft[key]}
                  onChange={(e) => set(key, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Promo */}
        <div className="rounded-xl border border-dashed border-slate-300 p-4 dark:border-white/15">
          <div className="flex flex-wrap items-center gap-3">
            <Tag className="h-4 w-4 text-brand-500" />
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Automatic discount
            </p>
            <select
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm dark:border-white/10 dark:bg-slate-900 dark:text-slate-100"
              value={draft.promoType}
              onChange={(e) => set('promoType', e.target.value as Draft['promoType'])}
            >
              <option value="">Off</option>
              <option value="PERCENT">Percent off</option>
              <option value="FLAT">Flat ₹ off</option>
            </select>
          </div>

          {promoOn ? (
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className={labelCls}>
                  {draft.promoType === 'PERCENT' ? 'Percent (1-100)' : 'Amount (₹)'}
                </label>
                <div className="relative">
                  <input
                    className={inputCls}
                    type="number"
                    min={1}
                    value={draft.promoValue}
                    onChange={(e) => set('promoValue', e.target.value)}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    {draft.promoType === 'PERCENT' ? (
                      <Percent className="h-4 w-4" />
                    ) : (
                      <IndianRupee className="h-4 w-4" />
                    )}
                  </span>
                </div>
              </div>
              <div>
                <label className={labelCls}>Badge text</label>
                <input
                  className={inputCls}
                  value={draft.promoLabel}
                  onChange={(e) => set('promoLabel', e.target.value)}
                  placeholder="Launch offer"
                />
              </div>
              <div>
                <label className={labelCls}>Starts (optional)</label>
                <input
                  className={inputCls}
                  type="datetime-local"
                  value={draft.promoStartsAt}
                  onChange={(e) => set('promoStartsAt', e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>Ends (optional)</label>
                <input
                  className={inputCls}
                  type="datetime-local"
                  value={draft.promoEndsAt}
                  onChange={(e) => set('promoEndsAt', e.target.value)}
                />
              </div>
              <p className="sm:col-span-2 lg:col-span-4 text-xs text-slate-500 dark:text-slate-400">
                Monthly preview:{' '}
                <span className="text-slate-400 line-through">{formatMoney(monthlyPaise)}</span>{' '}
                <span className="font-bold text-brand-600 dark:text-brand-300">
                  {formatMoney(previewFinal)}
                </span>{' '}
                · applies to everyone with no code. A coupon stacks on top of this.
              </p>
            </div>
          ) : null}
        </div>

        {/* Flags */}
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-200 pt-4 dark:border-white/10">
          <Toggle checked={draft.isPopular} onChange={(v) => set('isPopular', v)} label="Most popular" />
          <Toggle checked={draft.isBestValue} onChange={(v) => set('isBestValue', v)} label="Best value" />
          <Toggle checked={draft.contactSales} onChange={(v) => set('contactSales', v)} label="Contact sales" />
          <Toggle checked={draft.isPublic} onChange={(v) => set('isPublic', v)} label="Show publicly" />
          <Toggle checked={draft.isActive} onChange={(v) => set('isActive', v)} label="Active" />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Pricing console. These rows are the single source of truth: the landing page,
 * the in-app plans page, the signup summary and the Razorpay charge all read
 * them, so a save here changes every one of those at once.
 */
export function AdminPricingPage() {
  const plansQuery = useQuery({ queryKey: ['admin', 'plans'], queryFn: adminApi.plans });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Pricing</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Prices, copy, limits and automatic discounts. Saving takes effect immediately on the
          landing page, the in-app plans page and at checkout — no deploy needed.
        </p>
      </div>

      {plansQuery.isLoading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-64 w-full rounded-2xl" />
          ))}
        </div>
      ) : plansQuery.isError ? (
        <p className="text-sm text-red-600">Could not load plans.</p>
      ) : (
        (plansQuery.data ?? []).map((plan) => <PlanEditor key={plan.id} plan={plan} />)
      )}
    </div>
  );
}
