import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Building2, Users, Instagram, TrendingUp, IndianRupee, Send } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { adminApi } from '@/lib/admin-api';
import { money, shortDate, statusClass } from './admin-format';

function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm text-slate-500 dark:text-slate-400">{label}</p>
          <p className="font-display text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
          {sub ? <p className="text-xs text-slate-400">{sub}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function AdminOverviewPage() {
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'overview'], queryFn: adminApi.overview });

  if (isLoading || !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  const t = data.totals;
  const statusEntries = Object.entries(data.subscriptions.byStatus);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Platform overview</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Everything happening across your customers.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat icon={Building2} label="Organizations" value={t.organizations.toLocaleString()} sub={`${t.activeOrganizations} active`} />
        <Stat icon={IndianRupee} label="MRR" value={money(data.subscriptions.mrrMinor, data.subscriptions.currency)} sub="active + trialing plans" />
        <Stat icon={TrendingUp} label="New (30 days)" value={t.newOrganizations30d.toLocaleString()} sub="organizations" />
        <Stat icon={Users} label="Users" value={t.users.toLocaleString()} sub={`${t.superAdmins} super-admin`} />
        <Stat icon={Instagram} label="Connected IG accounts" value={t.connectedInstagramAccounts.toLocaleString()} />
        <Stat icon={Send} label={`DMs sent · ${data.usage.period}`} value={data.usage.dmsSent.toLocaleString()} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="py-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Subscriptions by status
            </h2>
            {statusEntries.length === 0 ? (
              <p className="text-sm text-slate-400">No subscriptions yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {statusEntries.map(([status, count]) => (
                  <span
                    key={status}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${statusClass(status)}`}
                  >
                    {status} · {count}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Latest signups
            </h2>
            <ul className="space-y-2.5">
              {data.recentSignups.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 text-sm">
                  <Link to={`/admin/customers/${o.id}`} className="min-w-0">
                    <span className="block truncate font-medium text-slate-800 hover:text-brand-600 dark:text-slate-100">
                      {o.name}
                    </span>
                    <span className="block truncate text-xs text-slate-400">{o.ownerEmail}</span>
                  </Link>
                  <span className="shrink-0 text-xs text-slate-400">{shortDate(o.createdAt)}</span>
                </li>
              ))}
              {data.recentSignups.length === 0 ? <li className="text-sm text-slate-400">Nothing yet.</li> : null}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
