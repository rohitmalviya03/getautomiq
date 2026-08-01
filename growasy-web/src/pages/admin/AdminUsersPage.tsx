import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Search, ShieldCheck, ShieldOff, Ban, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/toast-context';
import { adminApi, type AdminUserRow } from '@/lib/admin-api';
import { useAuthStore } from '@/stores/auth-store';
import { ApiError } from '@/lib/api-client';
import { shortDate, statusClass } from './admin-format';

const PAGE_SIZE = 20;

export function AdminUsersPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);

  function onSearchChange(value: string) {
    setSearch(value);
    window.clearTimeout((onSearchChange as unknown as { t?: number }).t);
    (onSearchChange as unknown as { t?: number }).t = window.setTimeout(() => {
      setDebounced(value);
      setPage(1);
    }, 300);
  }

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', debounced, page],
    queryFn: () => adminApi.users({ search: debounced, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
  const onErr = (e: unknown) =>
    showToast({ variant: 'error', title: 'Action failed', description: e instanceof ApiError ? e.message : undefined });

  const superAdminMutation = useMutation({
    mutationFn: (u: AdminUserRow) => adminApi.setSuperAdmin(u.id, !u.isSuperAdmin),
    onSuccess: async (_d, u) => {
      await invalidate();
      showToast({ variant: 'success', title: u.isSuperAdmin ? 'Admin access removed' : 'Promoted to super-admin' });
    },
    onError: onErr,
  });

  const suspendMutation = useMutation({
    mutationFn: (u: AdminUserRow) =>
      u.status === 'SUSPENDED' ? adminApi.reactivateUser(u.id) : adminApi.suspendUser(u.id),
    onSuccess: async (_d, u) => {
      await invalidate();
      showToast({ variant: 'success', title: u.status === 'SUSPENDED' ? 'User reactivated' : 'User suspended' });
    },
    onError: onErr,
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Users</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {data ? `${data.total.toLocaleString()} users` : 'Everyone with an account.'}
          </p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="Search name or email" className="pl-9" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Orgs</th>
                  <th className="px-4 py-3 font-semibold">Joined</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3" colSpan={5}>
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ))
                ) : data && data.items.length > 0 ? (
                  data.items.map((u) => {
                    const isSelf = u.id === me?.id;
                    return (
                      <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-100">
                            {u.firstName} {u.lastName}
                            {u.isSuperAdmin ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                                <ShieldCheck className="h-3 w-3" /> admin
                              </span>
                            ) : null}
                          </span>
                          <span className="text-xs text-slate-400">{u.email}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass(u.status)}`}>{u.status}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{u.ownedOrganizations}</td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{shortDate(u.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isSelf || superAdminMutation.isPending}
                              onClick={() => superAdminMutation.mutate(u)}
                              title={u.isSuperAdmin ? 'Remove super-admin' : 'Make super-admin'}
                            >
                              {u.isSuperAdmin ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isSelf || u.isSuperAdmin || suspendMutation.isPending}
                              onClick={() => suspendMutation.mutate(u)}
                              title={u.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}
                            >
                              {u.status === 'SUSPENDED' ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                              ) : (
                                <Ban className="h-4 w-4 text-red-500" />
                              )}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="px-4 py-10 text-center text-sm text-slate-400" colSpan={5}>
                      No users found.
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
          <span>Page {data.page}</span>
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
