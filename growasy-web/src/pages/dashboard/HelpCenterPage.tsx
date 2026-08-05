import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { ArrowLeft, LifeBuoy, MessageSquare, Plus, Send } from 'lucide-react';
import { PageTransition } from '@/components/ui/PageTransition';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Label, FieldError } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/toast-context';
import { ApiError } from '@/lib/api-client';
import {
  supportApi,
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  type CreateTicketInput,
  type TicketCategory,
  type TicketStatus,
} from '@/lib/support-api';

const STATUS_STYLES: Record<TicketStatus, string> = {
  OPEN: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  IN_PROGRESS: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  RESOLVED: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  CLOSED: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

/** Answers to the questions support actually gets, so most people never file a ticket. */
const FAQS: { q: string; a: string }[] = [
  {
    q: 'My automation isn’t sending DMs — what should I check?',
    a: 'Open Automations and confirm the rule is Active and its keyword matches what people actually comment. Instagram only lets us DM someone who commented in the last 7 days, and only if your account is still connected — check Instagram Accounts for a reconnect prompt.',
  },
  {
    q: 'Why does my Instagram account say it needs reconnecting?',
    a: 'Instagram access tokens expire. Go to Instagram Accounts and reconnect — your automations, contacts and history stay exactly as they are.',
  },
  {
    q: 'How is my DM limit counted?',
    a: 'Every automated DM counts once against your plan’s monthly allowance. The counter resets on your billing anchor date, which is shown on the Billing page.',
  },
  {
    q: 'Can one automation run on several posts?',
    a: 'Yes. When you create or edit an automation, pick as many posts or reels as you like in the post selector. Leave it empty to run on comments across every post.',
  },
  {
    q: 'How do I change or cancel my plan?',
    a: 'Billing → pick a plan, or Cancel plan. Cancelling keeps your paid features until the end of the period you already paid for, then moves you to Free. Nothing is deleted.',
  },
];

function StatusPill({ status }: { status: TicketStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {TICKET_STATUS_LABELS[status]}
    </span>
  );
}

function NewTicketForm({ onDone }: { onDone: () => void }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateTicketInput>({
    defaultValues: { subject: '', message: '', category: 'OTHER', contactEmail: '', contactPhone: '' },
  });

  const create = useMutation({
    mutationFn: (values: CreateTicketInput) =>
      supportApi.create({
        ...values,
        // Blank optionals are dropped so the server falls back to the account email.
        contactEmail: values.contactEmail?.trim() || undefined,
        contactPhone: values.contactPhone?.trim() || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['support', 'tickets'] });
      reset();
      showToast({
        variant: 'success',
        title: 'Ticket raised',
        description: 'We’ll reply by email and here in the help centre.',
      });
      onDone();
    },
    onError: (e) =>
      showToast({
        variant: 'error',
        title: 'Could not raise the ticket',
        description: e instanceof ApiError ? e.message : 'Please try again.',
      }),
  });

  const inputCls =
    'focus-ring w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Raise a ticket</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit((v) => create.mutate(v))}>
          <div>
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              placeholder="Briefly, what’s wrong?"
              error={errors.subject?.message}
              {...register('subject', {
                required: 'Give your ticket a short subject',
                minLength: { value: 3, message: 'A little more detail, please' },
              })}
            />
            <FieldError message={errors.subject?.message} />
          </div>

          <div>
            <Label htmlFor="category">What’s it about?</Label>
            <select id="category" className={inputCls} {...register('category')}>
              {(Object.keys(TICKET_CATEGORY_LABELS) as TicketCategory[]).map((c) => (
                <option key={c} value={c}>
                  {TICKET_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="message">Details</Label>
            <textarea
              id="message"
              rows={5}
              placeholder="What did you expect to happen, and what happened instead? Include the automation name or post link if it helps."
              className={inputCls}
              {...register('message', {
                required: 'Please describe the issue',
                minLength: { value: 10, message: 'Please describe the issue in a little more detail' },
              })}
            />
            <FieldError message={errors.message?.message} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="contactEmail">Reply-to email (optional)</Label>
              <Input
                id="contactEmail"
                type="email"
                placeholder="Defaults to your account email"
                error={errors.contactEmail?.message}
                {...register('contactEmail')}
              />
              <FieldError message={errors.contactEmail?.message} />
            </div>
            <div>
              <Label htmlFor="contactPhone">Phone / WhatsApp (optional)</Label>
              <Input id="contactPhone" placeholder="+91 98765 43210" {...register('contactPhone')} />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
            <Button type="submit" isLoading={create.isPending}>
              <Send className="h-4 w-4" /> Send ticket
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function TicketThread({ ticketId, onBack }: { ticketId: string; onBack: () => void }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState('');

  const ticketQuery = useQuery({
    queryKey: ['support', 'tickets', ticketId],
    queryFn: () => supportApi.detail(ticketId),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['support', 'tickets'] });
  };

  const sendReply = useMutation({
    mutationFn: () => supportApi.reply(ticketId, reply.trim()),
    onSuccess: async () => {
      setReply('');
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: ['support', 'tickets', ticketId] });
    },
    onError: (e) =>
      showToast({
        variant: 'error',
        title: 'Reply failed',
        description: e instanceof ApiError ? e.message : undefined,
      }),
  });

  const close = useMutation({
    mutationFn: () => supportApi.close(ticketId),
    onSuccess: async () => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: ['support', 'tickets', ticketId] });
      showToast({ variant: 'success', title: 'Ticket closed' });
    },
  });

  const ticket = ticketQuery.data;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="focus-ring inline-flex items-center gap-1.5 rounded-md text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
      >
        <ArrowLeft className="h-4 w-4" /> All tickets
      </button>

      {ticketQuery.isLoading || !ticket ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        <Card>
          <CardContent className="space-y-4 py-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  {ticket.subject}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {TICKET_CATEGORY_LABELS[ticket.category]} · raised{' '}
                  {new Date(ticket.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill status={ticket.status} />
                {ticket.status !== 'CLOSED' ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    isLoading={close.isPending}
                    onClick={() => close.mutate()}
                  >
                    Close
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-white/10">
              {ticket.messages.map((m) => {
                // No authorUserId means the support team wrote it.
                const fromSupport = m.authorUserId === null || m.authorName === null;
                return (
                  <div
                    key={m.id}
                    className={`rounded-xl p-3 text-sm ${
                      fromSupport
                        ? 'bg-brand-50 dark:bg-brand-950/40'
                        : 'bg-slate-50 dark:bg-slate-800/60'
                    }`}
                  >
                    <p className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {fromSupport ? 'Automiq support' : (m.authorName ?? 'You')} ·{' '}
                      {new Date(m.createdAt).toLocaleString()}
                    </p>
                    <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{m.body}</p>
                  </div>
                );
              })}
            </div>

            {ticket.status !== 'CLOSED' ? (
              <form
                className="space-y-2 border-t border-slate-200 pt-4 dark:border-white/10"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (reply.trim()) sendReply.mutate();
                }}
              >
                <Label htmlFor="reply">Add a reply</Label>
                <textarea
                  id="reply"
                  rows={3}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  className="focus-ring w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
                <div className="flex justify-end">
                  <Button type="submit" size="sm" isLoading={sendReply.isPending} disabled={!reply.trim()}>
                    <Send className="h-4 w-4" /> Send
                  </Button>
                </div>
              </form>
            ) : (
              <p className="border-t border-slate-200 pt-4 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
                This ticket is closed. Raise a new one if you need anything else.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function HelpCenterPage() {
  const [creating, setCreating] = useState(false);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);

  const ticketsQuery = useQuery({
    queryKey: ['support', 'tickets'],
    queryFn: supportApi.list,
  });
  const tickets = ticketsQuery.data ?? [];

  if (openTicketId) {
    return (
      <PageTransition>
        <div className="mx-auto max-w-3xl">
          <TicketThread ticketId={openTicketId} onBack={() => setOpenTicketId(null)} />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Help centre
            </h1>
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              Answers to the common questions — and a way to reach a human.
            </p>
          </div>
          {!creating ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Raise a ticket
            </Button>
          ) : null}
        </div>

        {creating ? <NewTicketForm onDone={() => setCreating(false)} /> : null}

        {/* Your tickets */}
        <Card>
          <CardHeader>
            <CardTitle>Your tickets</CardTitle>
          </CardHeader>
          <CardContent>
            {ticketsQuery.isLoading ? (
              <div className="space-y-2">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : tickets.length === 0 ? (
              <EmptyState
                icon={LifeBuoy}
                title="No tickets yet"
                description="If something isn’t working, raise a ticket and we’ll get back to you."
              />
            ) : (
              <ul className="divide-y divide-slate-200 dark:divide-white/10">
                {tickets.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setOpenTicketId(t.id)}
                      className="focus-ring flex w-full items-center justify-between gap-3 py-3 text-left"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                          {t.subject}
                        </span>
                        <span className="text-xs text-slate-400">
                          {TICKET_CATEGORY_LABELS[t.category]} · updated{' '}
                          {new Date(t.updatedAt).toLocaleDateString()}
                          {t.messageCount ? ` · ${t.messageCount} messages` : ''}
                        </span>
                      </span>
                      <StatusPill status={t.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* FAQ */}
        <Card>
          <CardHeader>
            <CardTitle>Common questions</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-slate-200 dark:divide-white/10">
            {FAQS.map((f) => (
              <details key={f.q} className="group py-3">
                <summary className="focus-ring cursor-pointer list-none text-sm font-medium text-slate-800 marker:hidden dark:text-slate-100">
                  <span className="inline-flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 shrink-0 text-brand-500" />
                    {f.q}
                  </span>
                </summary>
                <p className="mt-2 pl-6 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {f.a}
                </p>
              </details>
            ))}
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
