import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { adminApi } from '@/lib/admin-api';
import { dateTime } from './admin-format';

const PAGE_SIZE = 30;

function summarize(after: string | null): string {
  if (!after) return '';
  try {
    const obj = JSON.parse(after) as Record<string, unknown>;
    return Object.entries(obj)
      .filter(([k]) => k !== 'reason')
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join(' · ');
  } catch {
    return '';
  }
}

export function AdminAuditPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'audit', page],
    queryFn: () => adminApi.auditLog({ page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Audit log</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Every admin action, most recent first.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3 font-semibold">When</th>
                  <th className="px-4 py-3 font-semibold">Actor</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Target</th>
                  <th className="px-4 py-3 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3" colSpan={5}>
                        <Skeleton className="h-5 w-full" />
                      </td>
                    </tr>
                  ))
                ) : data && data.items.length > 0 ? (
                  data.items.map((a) => (
                    <tr key={a.id} className="align-top hover:bg-slate-50 dark:hover:bg-white/5">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">{dateTime(a.createdAt)}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{a.actor?.email ?? 'system'}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-700/40 dark:text-slate-300">
                          {a.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{a.entityType}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{summarize(a.after)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-10 text-center text-sm text-slate-400" colSpan={5}>
                      No audit entries yet.
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
