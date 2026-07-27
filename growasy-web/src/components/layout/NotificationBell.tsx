import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { notificationsApi } from '@/lib/notifications-api';

/** Relative time like "2m", "3h", "5d". */
function ago(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const countQuery = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: notificationsApi.unreadCount,
    refetchInterval: 60_000,
  });
  const listQuery = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: notificationsApi.list,
    enabled: open,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] });
  };
  const markRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: invalidate,
  });
  const markAll = useMutation({ mutationFn: notificationsApi.markAllRead, onSuccess: invalidate });

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const unread = countQuery.data?.count ?? 0;
  const items = listQuery.data ?? [];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="focus-ring relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
      >
        <Bell className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-700">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Notifications
            </span>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => markAll.mutate()}
                className="focus-ring inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            ) : null}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {listQuery.isLoading ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">You're all caught up 🎉</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => !n.isRead && markRead.mutate(n.id)}
                      className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50 ${
                        n.isRead ? '' : 'bg-brand-50/50 dark:bg-brand-950/20'
                      }`}
                    >
                      {!n.isRead ? (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                      ) : (
                        <span className="mt-1.5 h-2 w-2 shrink-0" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                            {n.title}
                          </span>
                          <span className="shrink-0 text-[11px] text-slate-400">
                            {ago(n.createdAt)}
                          </span>
                        </span>
                        {n.body ? (
                          <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                            {n.body}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
