import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Plus, Ticket, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/toast-context';
import { ApiError } from '@/lib/api-client';
import { adminApi, type AdminCoupon, type UpsertCouponInput } from '@/lib/admin-api';
import { formatMoney } from '@/lib/pricing-api';
import { inputCls, labelCls, selectCls, toLocalInput, toPaise, Toggle } from './pricing-ui';

const TIERS = ['STARTER', 'GROWTH', 'PROFESSIONAL'] as const;

interface CouponDraft {
  code: string;
  description: string;
  type: 'PERCENT' | 'FLAT';
  value: string;
  tiers: string[];
  cycles: ('monthly' | 'yearly')[];
  maxRedemptions: string;
  maxPerOrg: string;
  startsAt: string;
  endsAt: string;
}

const emptyDraft: CouponDraft = {
  code: '',
  description: '',
  type: 'PERCENT',
  value: '',
  tiers: [],
  cycles: [],
  maxRedemptions: '',
  maxPerOrg: '1',
  startsAt: '',
  endsAt: '',
};

function toInput(draft: CouponDraft): UpsertCouponInput {
  return {
    code: draft.code.trim().toUpperCase(),
    description: draft.description.trim() || undefined,
    type: draft.type,
    value: draft.type === 'FLAT' ? toPaise(draft.value) : Number(draft.value || '0'),
    appliesToTiers: draft.tiers,
    appliesToCycles: draft.cycles,
    maxRedemptions: draft.maxRedemptions ? Number(draft.maxRedemptions) : null,
    maxPerOrg: Number(draft.maxPerOrg || '0'),
    startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : '',
    endsAt: draft.endsAt ? new Date(draft.endsAt).toISOString() : '',
  };
}

function describe(c: AdminCoupon): string {
  const amount = c.type === 'PERCENT' ? `${c.value}% off` : `${formatMoney(c.value)} off`;
  const tiers = c.appliesToTiers.length ? c.appliesToTiers.join(', ') : 'all plans';
  const cycles = c.appliesToCycles.length ? c.appliesToCycles.join(' / ') : 'monthly & yearly';
  return `${amount} · ${tiers} · ${cycles}`;
}

function status(c: AdminCoupon): { label: string; cls: string } {
  const now = Date.now();
  if (!c.isActive) return { label: 'Disabled', cls: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300' };
  if (c.endsAt && new Date(c.endsAt).getTime() < now)
    return { label: 'Expired', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' };
  if (c.startsAt && new Date(c.startsAt).getTime() > now)
    return { label: 'Scheduled', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' };
  if (c.maxRedemptions !== null && c.redeemedCount >= c.maxRedemptions)
    return { label: 'Used up', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' };
  return { label: 'Live', cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' };
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<CouponDraft>(emptyDraft);
  const set = <K extends keyof CouponDraft>(k: K, v: CouponDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const create = useMutation({
    mutationFn: () => adminApi.createCoupon(toInput(draft)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] });
      showToast({ variant: 'success', title: `Coupon ${draft.code.toUpperCase()} created` });
      onDone();
    },
    onError: (e) =>
      showToast({
        variant: 'error',
        title: 'Could not create coupon',
        description: e instanceof ApiError ? e.message : undefined,
      }),
  });

  const toggleIn = <T extends string>(list: T[], v: T): T[] =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">New coupon</h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={labelCls}>Code</label>
            <input
              className={`${inputCls} font-mono uppercase`}
              value={draft.code}
              maxLength={40}
              placeholder="LAUNCH20"
              onChange={(e) => set('code', e.target.value.toUpperCase())}
            />
          </div>
          <div>
            <label className={labelCls}>Type</label>
            <select
              className={selectCls}
              value={draft.type}
              onChange={(e) => set('type', e.target.value as CouponDraft['type'])}
            >
              <option value="PERCENT">Percent off</option>
              <option value="FLAT">Flat ₹ off</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>
              {draft.type === 'PERCENT' ? 'Percent (1-100)' : 'Amount (₹)'}
            </label>
            <input
              className={inputCls}
              type="number"
              min={1}
              value={draft.value}
              onChange={(e) => set('value', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <input
              className={inputCls}
              value={draft.description}
              placeholder="Diwali campaign"
              onChange={(e) => set('description', e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className={labelCls}>Plans — none selected means all</p>
            <div className="mt-2 flex flex-wrap gap-3">
              {TIERS.map((t) => (
                <Toggle
                  key={t}
                  checked={draft.tiers.includes(t)}
                  onChange={() => set('tiers', toggleIn(draft.tiers, t as string))}
                  label={t}
                />
              ))}
            </div>
          </div>
          <div>
            <p className={labelCls}>Billing — none selected means both</p>
            <div className="mt-2 flex flex-wrap gap-3">
              {(['monthly', 'yearly'] as const).map((c) => (
                <Toggle
                  key={c}
                  checked={draft.cycles.includes(c)}
                  onChange={() => set('cycles', toggleIn(draft.cycles, c))}
                  label={c}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={labelCls}>Total uses (blank = ∞)</label>
            <input
              className={inputCls}
              type="number"
              min={1}
              value={draft.maxRedemptions}
              onChange={(e) => set('maxRedemptions', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Per customer (0 = ∞)</label>
            <input
              className={inputCls}
              type="number"
              min={0}
              value={draft.maxPerOrg}
              onChange={(e) => set('maxPerOrg', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Starts (optional)</label>
            <input
              className={inputCls}
              type="datetime-local"
              value={draft.startsAt}
              onChange={(e) => set('startsAt', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Ends (optional)</label>
            <input
              className={inputCls}
              type="datetime-local"
              value={draft.endsAt}
              onChange={(e) => set('endsAt', e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-white/10">
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button
            isLoading={create.isPending}
            disabled={!draft.code.trim() || !draft.value}
            onClick={() => create.mutate()}
          >
            Create coupon
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CouponRow({ coupon }: { coupon: AdminCoupon }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [confirmOff, setConfirmOff] = useState(false);
  const [showUses, setShowUses] = useState(false);
  const s = status(coupon);

  const redemptions = useQuery({
    queryKey: ['admin', 'coupons', coupon.id, 'redemptions'],
    queryFn: () => adminApi.couponRedemptions(coupon.id),
    enabled: showUses,
  });

  const deactivate = useMutation({
    mutationFn: () => adminApi.deactivateCoupon(coupon.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] });
      setConfirmOff(false);
      showToast({ variant: 'success', title: `${coupon.code} disabled` });
    },
  });

  const reactivate = useMutation({
    mutationFn: () => adminApi.updateCoupon(coupon.id, { isActive: true }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] });
      showToast({ variant: 'success', title: `${coupon.code} re-enabled` });
    },
  });

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-sm font-bold tracking-wide text-slate-800 dark:bg-slate-800 dark:text-slate-100">
              {coupon.code}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${s.cls}`}>
              {s.label}
            </span>
            <span className="text-sm text-slate-600 dark:text-slate-300">{describe(coupon)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowUses((v) => !v)}>
              <Users className="h-4 w-4" />
              {coupon.redeemedCount}
              {coupon.maxRedemptions !== null ? ` / ${coupon.maxRedemptions}` : ''}
            </Button>
            {coupon.isActive ? (
              <Button variant="ghost" size="sm" onClick={() => setConfirmOff(true)}>
                <Ban className="h-4 w-4" /> Disable
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                isLoading={reactivate.isPending}
                onClick={() => reactivate.mutate()}
              >
                Enable
              </Button>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          {coupon.description ? `${coupon.description} · ` : ''}
          {coupon.maxPerOrg === 0 ? 'unlimited per customer' : `${coupon.maxPerOrg} per customer`}
          {coupon.startsAt ? ` · from ${toLocalInput(coupon.startsAt).replace('T', ' ')}` : ''}
          {coupon.endsAt ? ` · until ${toLocalInput(coupon.endsAt).replace('T', ' ')}` : ''}
        </p>

        {showUses ? (
          <div className="rounded-lg border border-slate-200 p-3 dark:border-white/10">
            {redemptions.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (redemptions.data ?? []).length === 0 ? (
              <p className="text-xs text-slate-500">Not used yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {(redemptions.data ?? []).map((r) => (
                  <li key={r.id} className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
                    <span>{r.organization?.name ?? r.organizationId}</span>
                    <span>
                      {formatMoney(r.amountBefore)} → {formatMoney(r.amountAfter)}{' '}
                      <span className="font-semibold text-green-600 dark:text-green-400">
                        (−{formatMoney(r.discountAmount)})
                      </span>{' '}
                      · {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </CardContent>

      <ConfirmDialog
        open={confirmOff}
        title={`Disable ${coupon.code}?`}
        description="Nobody will be able to redeem it from now on. Past redemptions and the customers who already used it are unaffected."
        confirmLabel="Disable"
        cancelLabel="Keep active"
        variant="danger"
        isLoading={deactivate.isPending}
        onConfirm={() => deactivate.mutate()}
        onCancel={() => setConfirmOff(false)}
      />
    </Card>
  );
}

/**
 * Discount codes customers type at checkout. These stack on top of whatever
 * automatic plan promo is running (promo first, then the coupon on the reduced
 * amount) — the server recomputes both before it creates the Razorpay order.
 */
export function AdminCouponsPage() {
  const [creating, setCreating] = useState(false);
  const couponsQuery = useQuery({ queryKey: ['admin', 'coupons'], queryFn: adminApi.coupons });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Coupons</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Codes customers enter at checkout. They stack on top of any automatic plan discount.
          </p>
        </div>
        {!creating ? (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New coupon
          </Button>
        ) : null}
      </div>

      {creating ? <CreateForm onDone={() => setCreating(false)} /> : null}

      {couponsQuery.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : couponsQuery.isError ? (
        <p className="text-sm text-red-600">Could not load coupons.</p>
      ) : (couponsQuery.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Ticket className="h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No coupons yet. Create one to run a campaign or give an influencer their own code.
            </p>
          </CardContent>
        </Card>
      ) : (
        (couponsQuery.data ?? []).map((c) => <CouponRow key={c.id} coupon={c} />)
      )}
    </div>
  );
}
