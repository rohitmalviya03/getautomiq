import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/toast-context';
import { adminApi } from '@/lib/admin-api';
import { shortDate, statusClass, PLAN_TIERS } from './admin-format';
import { ApiError } from '@/lib/api-client';

const PAGE_SIZE = 20;

export function AdminCustomersPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);

  const changePlan = useMutation({
    mutationFn: ({ id, tier }: { id: string; tier: string }) => adminApi.changePlan(id, { tier }),
    onSuccess: async (_d, { tier }) => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'customers'] });
      showToast({ variant: 'success', title: `Plan changed to ${tier}` });
    },
    onError: (e) =>
      showToast({ variant: 'error', title: 'Could not change plan', description: e instanceof ApiError ? e.message : undefined }),
  });

  // Debounce the search box so we don't fire a request per keystroke.
  function onSearchChange(value: string) {
    setSearch(value);
    window.clearTimeout((onSearchChange as unknown as { t?: number }).t);
    (onSearchChange as unknown as { t?: number }).t = window.setTimeout(() => {
      setDebounced(value);
      setPage(1);
    }, 300);
  }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin', 'customers', debounced, page],
    queryFn: () => adminApi.customers({ search: debounced, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Customers</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {data ? `${data.total.toLocaleString()} organizations` : 'All organizations on the platform.'}
          </p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search name, slug or owner email"
            className="pl-9"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3 font-semibold">Organization</th>
                  <th className="px-4 py-3 font-semibold">Plan</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Members</th>
                  <th className="px-4 py-3 font-semibold">IG</th>
                  <th className="px-4 py-3 font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3" colSpan={6}>
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ))
                ) : data && data.items.length > 0 ? (
                  data.items.map((c) => (
                    <tr key={c.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                      <td className="px-4 py-3">
                        <Link to={`/admin/customers/${c.id}`} className="block">
                          <span className="flex items-center gap-2 font-medium text-slate-800 hover:text-brand-600 dark:text-slate-100">
                            {c.name}
                            {!c.isActive ? (
                              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700 dark:bg-red-500/15 dark:text-red-300">
                                suspended
                              </span>
                            ) : null}
                          </span>
                          <span className="text-xs text-slate-400">{c.owner.email}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={c.tier}
                          disabled={changePlan.isPending && changePlan.variables?.id === c.id}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => changePlan.mutate({ id: c.id, tier: e.target.value })}
                          className="focus-ring rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          title="Change plan"
                        >
                          {PLAN_TIERS.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        {c.subscriptionStatus ? (
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass(c.subscriptionStatus)}`}>
                            {c.subscriptionStatus}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{c.members}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{c.instagramAccounts}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{shortDate(c.createdAt)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-10 text-center text-sm text-slate-400" colSpan={6}>
                      No customers match “{debounced}”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {data ? (
        <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
          <span>
            Page {data.page}
            {isFetching ? ' · updating…' : ''}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <Button variant="secondary" size="sm" disabled={!data.hasMore} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
