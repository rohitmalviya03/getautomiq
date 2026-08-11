import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IndianRupee, Lock, Plus, Trash2, TrendingUp } from 'lucide-react';
import { PageTransition } from '@/components/ui/PageTransition';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/toast-context';
import { ApiKeysCard } from '@/components/revenue/ApiKeysCard';
import { revenueApi, type Conversion } from '@/lib/revenue-api';
import { formatMoney } from '@/lib/pricing-api';
import { ApiError } from '@/lib/api-client';

const RANGES = [7, 30, 90] as const;

/** How the buyer was found, said in words a creator would use. */
const MATCH_LABELS: Record<string, string> = {
  email: 'matched by email',
  contact: 'matched to a contact',
  link: 'came through a tracked link',
  none: 'no lead matched',
};

export function RevenuePage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [days, setDays] = useState<number>(30);
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Conversion | null>(null);

  const reportQuery = useQuery({
    queryKey: ['revenue', 'report', days],
    queryFn: () => revenueApi.report(days),
    retry: false,
  });
  const conversionsQuery = useQuery({
    queryKey: ['revenue', 'conversions'],
    queryFn: () => revenueApi.conversions(25),
    retry: false,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['revenue'] });

  const recordMutation = useMutation({
    mutationFn: () =>
      revenueApi.recordConversion({
        // Typed in rupees, stored in paise — the API speaks minor units everywhere.
        value: Math.round(Number(amount) * 100),
        email: email.trim(),
      }),
    onSuccess: (conversion) => {
      showToast({
        title: 'Sale recorded',
        description:
          conversion.ruleId !== null
            ? 'Credited to the automation that DM’d this buyer.'
            : 'No automation matched this buyer, so it counts as unattributed revenue.',
        variant: 'success',
      });
      setEmail('');
      setAmount('');
      invalidate();
    },
    onError: (err) =>
      showToast({
        title: 'Could not record the sale',
        description: err instanceof ApiError ? err.message : 'Something went wrong',
        variant: 'error',
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => revenueApi.removeConversion(id),
    onSuccess: () => {
      showToast({ title: 'Sale removed', variant: 'success' });
      setDeleteTarget(null);
      invalidate();
    },
    onError: () => showToast({ title: 'Could not remove the sale', variant: 'error' }),
  });

  const locked =
    reportQuery.error instanceof ApiError && reportQuery.error.code === 'PLAN_FEATURE_LOCKED';

  if (locked) {
    return (
      <PageTransition>
        <div className="mx-auto max-w-3xl">
          <EmptyState
            icon={Lock}
            title="Revenue attribution is a Pro feature"
            description="See exactly which automation, post and DM wording earned each sale — instead of guessing which one is carrying your account."
            action={
              <Link to="/billing">
                <Button>View plans</Button>
              </Link>
            }
          />
        </div>
      </PageTransition>
    );
  }

  const report = reportQuery.data;
  const currency = report?.currency ?? 'INR';
  const conversions = conversionsQuery.data?.items ?? [];
  const attributedShare =
    report && report.totalRevenue > 0
      ? Math.round((report.attributedRevenue / report.totalRevenue) * 100)
      : 0;
  const bestRuleRevenue = report?.byRule[0]?.revenue ?? 0;

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Revenue</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Which automations actually made you money — not just which ones sent the most DMs.
            </p>
          </div>
          <div className="flex gap-1 rounded-full bg-slate-100 p-1 dark:bg-white/5">
            {RANGES.map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setDays(range)}
                className={`focus-ring rounded-full px-3 py-1 text-sm font-medium transition ${
                  days === range
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-white/15 dark:text-white'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {range}d
              </button>
            ))}
          </div>
        </div>

        {reportQuery.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : report ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile
              label={`Revenue · last ${days} days`}
              value={formatMoney(report.totalRevenue, currency)}
              hint={`${report.totalConversions} ${report.totalConversions === 1 ? 'sale' : 'sales'}`}
            />
            <StatTile
              label="Traced to an automation"
              value={formatMoney(report.attributedRevenue, currency)}
              hint={`${attributedShare}% of everything reported`}
            />
            <StatTile
              label="Untraced"
              value={formatMoney(report.unattributedRevenue, currency)}
              hint="Buyers we never DM'd, or DM'd too long ago"
            />
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Revenue by automation</CardTitle>
            <CardDescription>
              Credited to the last DM a buyer received in the 30 days before they bought.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reportQuery.isLoading ? (
              <Skeleton className="h-24" />
            ) : report && report.byRule.length > 0 ? (
              <ul className="space-y-3">
                {report.byRule.map((row) => (
                  <li key={row.ruleId}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">
                        {row.ruleName}
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                        <strong className="text-slate-800 dark:text-slate-100">
                          {formatMoney(row.revenue, currency)}
                        </strong>{' '}
                        · {row.conversions} {row.conversions === 1 ? 'sale' : 'sales'}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{
                          width: `${bestRuleRevenue > 0 ? Math.max(2, (row.revenue / bestRuleRevenue) * 100) : 2}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={TrendingUp}
                title="No sales traced yet"
                description="Report a sale below, or connect your store with an API key so it happens on its own."
              />
            )}
          </CardContent>
        </Card>

        {report && report.byVariant.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Revenue by message variant</CardTitle>
              <CardDescription>
                Which wording earned the money — the only A/B result that pays.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-slate-200/70 text-sm dark:divide-white/10">
                {report.byVariant.map((row) => (
                  <li
                    key={`${row.ruleId}-${row.variantId}`}
                    className="flex items-baseline justify-between gap-3 py-2"
                  >
                    <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">
                      <strong className="mr-1.5">Variant {row.variantId}</strong>
                      <span className="text-slate-500 dark:text-slate-400">{row.ruleName}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                      <strong className="text-slate-800 dark:text-slate-100">
                        {formatMoney(row.revenue, currency)}
                      </strong>{' '}
                      · {row.conversions}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {report && report.byPost.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Posts that earned</CardTitle>
              <CardDescription>The post whose comment started the conversation.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-slate-200/70 text-sm dark:divide-white/10">
                {report.byPost.map((row) => (
                  <li
                    key={row.mediaId}
                    className="flex items-baseline justify-between gap-3 py-2"
                  >
                    <span className="min-w-0 truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                      {row.mediaId}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-700 dark:text-slate-200">
                      {formatMoney(row.revenue, currency)} · {row.conversions}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Record a sale by hand</CardTitle>
            <CardDescription>
              For when someone bought after a DM and your store isn't connected. Use the email you
              collected — that's how we find the lead.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (email.trim() && Number(amount) > 0) recordMutation.mutate();
              }}
            >
              <div className="min-w-[14rem] flex-1">
                <Label htmlFor="buyerEmail">Buyer's email</Label>
                <Input
                  id="buyerEmail"
                  type="email"
                  placeholder="buyer@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="w-36">
                <Label htmlFor="saleAmount">Amount (₹)</Label>
                <Input
                  id="saleAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="499"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                disabled={!email.trim() || !(Number(amount) > 0) || recordMutation.isPending}
              >
                <Plus className="mr-1.5 h-4 w-4" /> Record
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent sales</CardTitle>
          </CardHeader>
          <CardContent>
            {conversionsQuery.isLoading ? (
              <Skeleton className="h-24" />
            ) : conversions.length > 0 ? (
              <ul className="divide-y divide-slate-200/70 dark:divide-white/10">
                {conversions.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-800 dark:text-slate-100">
                        <strong>{formatMoney(row.value, row.currency)}</strong>
                        {row.ruleName ? (
                          <span className="text-slate-500 dark:text-slate-400">
                            {' '}
                            · {row.ruleName}
                            {row.variantId ? ` (variant ${row.variantId})` : ''}
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {new Date(row.occurredAt).toLocaleDateString()} ·{' '}
                        {row.buyerEmail ?? row.contact?.username ?? 'unknown buyer'} ·{' '}
                        {MATCH_LABELS[row.matchedBy] ?? row.matchedBy}
                        {row.source === 'MANUAL' ? ' · entered by hand' : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(row)}
                      className="focus-ring shrink-0 rounded-md p-1.5 text-slate-400 hover:text-rose-600"
                      aria-label="Remove this sale"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={IndianRupee}
                title="Nothing reported yet"
                description="Sales show up here as soon as your store reports one, or you record one above."
              />
            )}
          </CardContent>
        </Card>

        <ApiKeysCard />
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Remove this sale?"
        description="It stops counting towards your revenue totals. This cannot be undone."
        confirmLabel="Remove"
        variant="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </PageTransition>
  );
}

function StatTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
          {value}
        </p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      </CardContent>
    </Card>
  );
}
