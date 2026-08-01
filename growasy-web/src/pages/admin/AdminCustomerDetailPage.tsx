import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, LogIn, Ban, CheckCircle2, CreditCard, Instagram, Users2, Activity, Unplug } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/toast-context';
import { ChangePlanDialog } from '@/components/admin/ChangePlanDialog';
import { AdminActionsCard } from '@/components/admin/AdminActionsCard';
import { adminApi } from '@/lib/admin-api';
import { useAuthStore } from '@/stores/auth-store';
import { ApiError } from '@/lib/api-client';
import { money, shortDate, dateTime, statusClass } from './admin-format';

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Users2; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="py-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <Icon className="h-4 w-4" /> {title}
        </h2>
        {children}
      </CardContent>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right font-medium text-slate-800 dark:text-slate-100">{children}</span>
    </div>
  );
}

export function AdminCustomerDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const startImpersonation = useAuthStore((s) => s.startImpersonation);
  const [planOpen, setPlanOpen] = useState(false);
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [confirmImpersonate, setConfirmImpersonate] = useState(false);

  const { data: c, isLoading } = useQuery({
    queryKey: ['admin', 'customer', id],
    queryFn: () => adminApi.customer(id),
  });

  const suspendMutation = useMutation({
    mutationFn: () => (c?.isActive ? adminApi.suspendCustomer(id) : adminApi.reactivateCustomer(id)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'customer', id] });
      showToast({ variant: 'success', title: c?.isActive ? 'Customer suspended' : 'Customer reactivated' });
      setConfirmSuspend(false);
    },
    onError: (e) =>
      showToast({ variant: 'error', title: 'Action failed', description: e instanceof ApiError ? e.message : undefined }),
  });

  const disconnectMutation = useMutation({
    mutationFn: (accountId: string) => adminApi.disconnectAccount(id, accountId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'customer', id] });
      showToast({ variant: 'success', title: 'Instagram account disconnected' });
    },
    onError: (e) =>
      showToast({ variant: 'error', title: 'Disconnect failed', description: e instanceof ApiError ? e.message : undefined }),
  });

  const impersonateMutation = useMutation({
    mutationFn: () => adminApi.impersonate(id),
    onSuccess: (res) => {
      startImpersonation({
        accessToken: res.tokens.accessToken,
        user: {
          id: res.user.id,
          email: res.user.email,
          firstName: res.user.firstName,
          lastName: res.user.lastName,
          isEmailVerified: true,
          status: 'ACTIVE',
          organizationId: res.organization.id,
          isSuperAdmin: false,
        },
        organization: res.organization,
        userEmail: res.user.email,
      });
      navigate('/dashboard');
    },
    onError: (e) =>
      showToast({ variant: 'error', title: 'Could not impersonate', description: e instanceof ApiError ? e.message : undefined }),
  });

  if (isLoading || !c) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const sub = c.subscription;
  const dmUsage = c.usageTracking.find((u) => u.metric === 'MESSAGES_SENT');

  return (
    <div className="space-y-5">
      <Link to="/admin/customers" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600 dark:text-slate-400">
        <ArrowLeft className="h-4 w-4" /> All customers
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-slate-900 dark:text-white">
            {c.name}
            {!c.isActive ? (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold uppercase text-red-700 dark:bg-red-500/15 dark:text-red-300">
                suspended
              </span>
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {c.owner.email} · joined {shortDate(c.createdAt)} · {c.timezone}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setPlanOpen(true)}>
            <CreditCard className="h-4 w-4" /> Change plan
          </Button>
          <Button
            variant={c.isActive ? 'danger' : 'primary'}
            size="sm"
            onClick={() => setConfirmSuspend(true)}
          >
            {c.isActive ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {c.isActive ? 'Suspend' : 'Reactivate'}
          </Button>
          <Button variant="primary" size="sm" onClick={() => setConfirmImpersonate(true)}>
            <LogIn className="h-4 w-4" /> View as customer
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Subscription" icon={CreditCard}>
          {sub ? (
            <div className="space-y-1">
              <Row label="Plan">
                {sub.plan.name}{' '}
                <span className="text-xs text-slate-400">({sub.plan.tier})</span>
              </Row>
              <Row label="Status">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass(sub.status)}`}>{sub.status}</span>
              </Row>
              <Row label="Price">
                {money(sub.billingCycle === 'YEARLY' ? sub.plan.yearlyPrice : sub.plan.monthlyPrice, sub.plan.currency)} /{' '}
                {sub.billingCycle === 'YEARLY' ? 'yr' : 'mo'}
              </Row>
              <Row label="Current period">
                {shortDate(sub.currentPeriodStart)} → {shortDate(sub.currentPeriodEnd)}
              </Row>
              <Row label="Trial ends">{shortDate(sub.trialEndsAt)}</Row>
              <Row label="Cancels at period end">{sub.cancelAtPeriodEnd ? 'Yes' : 'No'}</Row>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No subscription — on the Free plan by default.</p>
          )}
        </Section>

        <Section title="Owner & team" icon={Users2}>
          <div className="space-y-1">
            <Row label="Owner">
              {c.owner.firstName} {c.owner.lastName}
            </Row>
            <Row label="Owner status">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass(c.owner.status)}`}>{c.owner.status}</span>
            </Row>
            <Row label="Last login">{dateTime(c.owner.lastLoginAt)}</Row>
            <Row label="Members">{c.members.length}</Row>
            <Row label="Contacts">{c._count.contacts.toLocaleString()}</Row>
            <Row label="Automations">{c._count.automationRules.toLocaleString()}</Row>
            <Row label="DMs this period">{dmUsage ? dmUsage.count.toLocaleString() : '0'}</Row>
          </div>
        </Section>

        <Section title="Instagram accounts" icon={Instagram}>
          {c.instagramAccounts.length === 0 ? (
            <p className="text-sm text-slate-400">None connected.</p>
          ) : (
            <ul className="space-y-2">
              {c.instagramAccounts.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-800 dark:text-slate-100">@{a.username}</span>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass(a.status)}`}>{a.status}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      isLoading={disconnectMutation.isPending && disconnectMutation.variables === a.id}
                      onClick={() => disconnectMutation.mutate(a.id)}
                      title="Force-disconnect this account"
                    >
                      <Unplug className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Recent automation activity" icon={Activity}>
          {c.recentActivity.length === 0 ? (
            <p className="text-sm text-slate-400">No activity yet.</p>
          ) : (
            <ul className="max-h-64 space-y-1.5 overflow-y-auto">
              {c.recentActivity.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-slate-600 dark:text-slate-300">
                    {e.outcome ?? 'processed'}
                    {e.dmSent ? ' · DM sent' : ''}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">{dateTime(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <AdminActionsCard customerId={id} ownerId={c.owner.id} ownerPending={c.owner.status === 'PENDING_VERIFICATION'} />

      {(c.invoices.length > 0 || c.payments.length > 0) && (
        <Section title="Billing history" icon={CreditCard}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-slate-400">Invoices</p>
              {c.invoices.length === 0 ? (
                <p className="text-sm text-slate-400">None.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {c.invoices.map((inv) => (
                    <li key={inv.id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-slate-600 dark:text-slate-300">{inv.invoiceNumber}</span>
                      <span className="shrink-0">{money(inv.amount, inv.currency)}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass(inv.status)}`}>{inv.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-slate-400">Payments</p>
              {c.payments.length === 0 ? (
                <p className="text-sm text-slate-400">None.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {c.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <span className="text-slate-500 dark:text-slate-400">{shortDate(p.createdAt)}</span>
                      <span className="shrink-0">{money(p.amount, p.currency)}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass(p.status)}`}>{p.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Section>
      )}

      <ChangePlanDialog open={planOpen} customerId={id} subscription={sub} onClose={() => setPlanOpen(false)} />

      <ConfirmDialog
        open={confirmSuspend}
        title={c.isActive ? `Suspend ${c.name}?` : `Reactivate ${c.name}?`}
        description={
          c.isActive
            ? 'All members will be logged out immediately and blocked until reactivated.'
            : 'Members will be able to log in again.'
        }
        confirmLabel={c.isActive ? 'Suspend' : 'Reactivate'}
        variant={c.isActive ? 'danger' : 'primary'}
        isLoading={suspendMutation.isPending}
        onConfirm={() => suspendMutation.mutate()}
        onCancel={() => setConfirmSuspend(false)}
      />

      <ConfirmDialog
        open={confirmImpersonate}
        title={`View the app as ${c.name}?`}
        description="You'll enter their workspace with full access. Everything you do is logged. Exit any time from the banner to return to admin."
        confirmLabel="Enter workspace"
        variant="primary"
        isLoading={impersonateMutation.isPending}
        onConfirm={() => impersonateMutation.mutate()}
        onCancel={() => setConfirmImpersonate(false)}
      />
    </div>
  );
}
