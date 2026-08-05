import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lock, Mail, Phone, Send, Ticket as TicketIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/toast-context';
import { ApiError } from '@/lib/api-client';
import { adminApi } from '@/lib/admin-api';
import {
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  type TicketPriority,
  type TicketStatus,
} from '@/lib/support-api';
import { inputCls, labelCls, selectCls } from './pricing-ui';

const STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const PRIORITIES: TicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const STATUS_STYLES: Record<TicketStatus, string> = {
  OPEN: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  IN_PROGRESS: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  RESOLVED: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  CLOSED: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
};

const PRIORITY_STYLES: Record<TicketPriority, string> = {
  LOW: 'text-slate-500',
  MEDIUM: 'text-slate-600 dark:text-slate-300',
  HIGH: 'text-orange-600 dark:text-orange-400',
  URGENT: 'text-red-600 dark:text-red-400',
};

function TicketDetailView({ id, onBack }: { id: string; onBack: () => void }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState('');
  const [isInternal, setIsInternal] = useState(false);

  const ticketQuery = useQuery({
    queryKey: ['admin', 'tickets', id],
    queryFn: () => adminApi.ticket(id),
  });
  const ticket = ticketQuery.data;

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'tickets'] });
  };

  const send = useMutation({
    mutationFn: () => adminApi.replyTicket(id, reply.trim(), isInternal),
    onSuccess: async () => {
      setReply('');
      await refresh();
      showToast({
        variant: 'success',
        title: isInternal ? 'Internal note added' : 'Reply sent to the customer',
      });
    },
    onError: (e) =>
      showToast({
        variant: 'error',
        title: 'Could not send',
        description: e instanceof ApiError ? e.message : undefined,
      }),
  });

  const update = useMutation({
    mutationFn: (body: { status?: TicketStatus; priority?: TicketPriority }) =>
      adminApi.updateTicket(id, body),
    onSuccess: async () => {
      await refresh();
      showToast({ variant: 'success', title: 'Ticket updated' });
    },
  });

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="focus-ring inline-flex items-center gap-1.5 rounded-md text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
      >
        <ArrowLeft className="h-4 w-4" /> Back to queue
      </button>

      {ticketQuery.isLoading || !ticket ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : (
        <>
          <Card>
            <CardContent className="space-y-4 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                    {ticket.subject}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {ticket.organization?.name ?? '—'} ·{' '}
                    {TICKET_CATEGORY_LABELS[ticket.category]} ·{' '}
                    {new Date(ticket.createdAt).toLocaleString()}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${STATUS_STYLES[ticket.status]}`}
                >
                  {TICKET_STATUS_LABELS[ticket.status]}
                </span>
              </div>

              {/* How to reach this customer — the whole point of the contact fields. */}
              <div className="flex flex-wrap gap-4 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
                <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                  <Mail className="h-4 w-4 text-slate-400" />
                  <a className="hover:underline" href={`mailto:${ticket.contactEmail ?? ''}`}>
                    {ticket.contactEmail ?? '—'}
                  </a>
                </span>
                {ticket.contactPhone ? (
                  <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                    <Phone className="h-4 w-4 text-slate-400" />
                    <a className="hover:underline" href={`tel:${ticket.contactPhone}`}>
                      {ticket.contactPhone}
                    </a>
                  </span>
                ) : null}
                <span className="text-slate-500 dark:text-slate-400">
                  Raised by {ticket.createdBy?.firstName} {ticket.createdBy?.lastName}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Status</label>
                  <select
                    className={selectCls}
                    value={ticket.status}
                    onChange={(e) => update.mutate({ status: e.target.value as TicketStatus })}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {TICKET_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Priority</label>
                  <select
                    className={selectCls}
                    value={ticket.priority}
                    onChange={(e) => update.mutate({ priority: e.target.value as TicketPriority })}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 py-5">
              {ticket.messages.map((m) => {
                const fromSupport = m.isInternal || m.authorUserId !== ticket.createdBy?.id;
                return (
                  <div
                    key={m.id}
                    className={`rounded-xl p-3 text-sm ${
                      m.isInternal
                        ? 'border border-dashed border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
                        : fromSupport
                          ? 'bg-brand-50 dark:bg-brand-950/40'
                          : 'bg-slate-50 dark:bg-slate-800/60'
                    }`}
                  >
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {m.isInternal ? <Lock className="h-3 w-3" /> : null}
                      {m.isInternal
                        ? 'Internal note'
                        : (m.authorName ?? 'Support')}{' '}
                      · {new Date(m.createdAt).toLocaleString()}
                    </p>
                    <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{m.body}</p>
                  </div>
                );
              })}

              <form
                className="space-y-2 border-t border-slate-200 pt-4 dark:border-white/10"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (reply.trim()) send.mutate();
                }}
              >
                <textarea
                  rows={4}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={isInternal ? 'Note for the team — the customer never sees this' : 'Reply to the customer…'}
                  className={inputCls}
                />
                <div className="flex items-center justify-between">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    Internal note
                  </label>
                  <Button type="submit" size="sm" isLoading={send.isPending} disabled={!reply.trim()}>
                    <Send className="h-4 w-4" /> {isInternal ? 'Add note' : 'Send reply'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/**
 * Support queue. Defaults to the statuses that still need work — a queue that
 * opens on "everything ever" is one nobody actually works from.
 */
export function AdminTicketsPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [status, setStatus] = useState<TicketStatus | ''>('OPEN');
  const [search, setSearch] = useState('');

  const ticketsQuery = useQuery({
    queryKey: ['admin', 'tickets', { status, search }],
    queryFn: () => adminApi.tickets({ status: status || undefined, search: search || undefined }),
  });

  if (openId) return <TicketDetailView id={openId} onBack={() => setOpenId(null)} />;

  const rows = ticketsQuery.data?.items ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Support tickets
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {ticketsQuery.data?.openCount ?? 0} open or in progress across all customers.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-900 dark:text-slate-100"
          value={status}
          onChange={(e) => setStatus(e.target.value as TicketStatus | '')}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {TICKET_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search subject, email or workspace"
          className="w-72 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-900 dark:text-slate-100"
        />
      </div>

      {ticketsQuery.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <TicketIcon className="h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No tickets match this filter.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="divide-y divide-slate-200 p-0 dark:divide-white/10">
            {rows.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setOpenId(t.id)}
                className="focus-ring flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-white/5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                    {t.subject}
                  </span>
                  <span className="text-xs text-slate-400">
                    {t.organization?.name ?? '—'} · {t.contactEmail ?? '—'} ·{' '}
                    {new Date(t.updatedAt).toLocaleDateString()}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={`text-xs font-bold ${PRIORITY_STYLES[t.priority]}`}>
                    {t.priority}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${STATUS_STYLES[t.status]}`}
                  >
                    {TICKET_STATUS_LABELS[t.status]}
                  </span>
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
