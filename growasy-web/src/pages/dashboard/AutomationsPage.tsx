import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Bot,
  Film,
  Image as ImageIcon,
  Instagram,
  Mail,
  MessageSquareReply,
  Pause,
  Pencil,
  Play,
  Plus,
  Send,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { PageTransition } from '@/components/ui/PageTransition';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Label, FieldError } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/toast-context';
import { instagramApi } from '@/lib/instagram-api';
import { automationsApi } from '@/lib/automations-api';
import { ApiError } from '@/lib/api-client';
import { automationRuleSchema, type AutomationFormValues } from '@/schemas/automation.schemas';
import { AUTOMATION_TEMPLATES, findTemplate } from '@/lib/automation-templates';
import type {
  AutomationRule,
  AutomationRulePayload,
  AutomationStatus,
  InstagramMedia,
  TriggerType,
} from '@/types/api';

const TRIGGER_OPTIONS: { value: TriggerType; label: string; hint: string }[] = [
  { value: 'COMMENT_KEYWORD', label: 'Comment', hint: 'On a post or reel' },
  { value: 'DM_KEYWORD', label: 'Direct message', hint: 'Someone DMs you' },
  { value: 'STORY_REPLY', label: 'Story reply', hint: 'Reply to your story' },
];

const TRIGGER_LABELS: Record<TriggerType, string> = {
  COMMENT_KEYWORD: 'Comment',
  DM_KEYWORD: 'DM',
  STORY_REPLY: 'Story reply',
};

const MATCH_TYPE_OPTIONS: { value: AutomationFormValues['matchType']; label: string }[] = [
  { value: 'CONTAINS', label: 'Contains keyword' },
  { value: 'EXACT', label: 'Exactly matches' },
  { value: 'STARTS_WITH', label: 'Starts with' },
  { value: 'REGEX', label: 'Matches regex' },
  { value: 'ANY', label: 'Any comment (no keyword)' },
];

const STATUS_BADGES: Record<AutomationStatus, { label: string; className: string }> = {
  ACTIVE: {
    label: 'Active',
    className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  },
  PAUSED: {
    label: 'Paused',
    className: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  },
  DRAFT: {
    label: 'Draft',
    className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  },
  ARCHIVED: {
    label: 'Archived',
    className: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  },
};

// forwardRef so react-hook-form's register() ref reaches the real DOM element —
// a plain function component would swallow the ref and RHF couldn't read the value.
const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { error?: string }
>(({ error, className = '', ...rest }, ref) => (
  <select
    ref={ref}
    aria-invalid={Boolean(error)}
    className={`focus-ring w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100 ${
      error ? 'border-red-400 dark:border-red-600' : 'border-slate-300 dark:border-slate-600'
    } ${className}`}
    {...rest}
  />
));
Select.displayName = 'Select';

const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string }
>(({ error, className = '', ...rest }, ref) => (
  <textarea
    ref={ref}
    aria-invalid={Boolean(error)}
    className={`focus-ring w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 ${
      error ? 'border-red-400 dark:border-red-600' : 'border-slate-300 dark:border-slate-600'
    } ${className}`}
    {...rest}
  />
));
Textarea.displayName = 'Textarea';

function StatusBadge({ status }: { status: AutomationStatus }) {
  const badge = STATUS_BADGES[status];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
      {badge.label}
    </span>
  );
}

function toFormValues(rule: AutomationRule): AutomationFormValues {
  return {
    instagramAccountId: rule.instagramAccountId,
    name: rule.name,
    triggerTypes: rule.triggerTypes?.length ? rule.triggerTypes : ['COMMENT_KEYWORD'],
    matchType: rule.matchType === 'ANY' ? 'ANY' : rule.matchType,
    keywords: rule.keywords.join(', '),
    dmText: rule.dmText,
    replyText: rule.replyText ?? '',
    mediaId: rule.mediaId ?? '',
    maxDmsPerUserPer24h: rule.maxDmsPerUserPer24h ? String(rule.maxDmsPerUserPer24h) : '',
    collectEmail: rule.collectEmail ?? false,
    emailSuccessMessage: rule.emailSuccessMessage ?? '',
    emailFailureMessage: rule.emailFailureMessage ?? '',
    status: rule.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
  };
}

function toPayload(values: AutomationFormValues): AutomationRulePayload {
  const hasComment = values.triggerTypes.includes('COMMENT_KEYWORD');
  return {
    instagramAccountId: values.instagramAccountId,
    name: values.name.trim(),
    triggerTypes: values.triggerTypes,
    matchType: values.matchType,
    keywords:
      values.matchType === 'ANY'
        ? []
        : values.keywords
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean),
    dmText: values.dmText.trim(),
    // Public reply + per-post filter only apply when a comment trigger is included.
    replyText: hasComment && values.replyText.trim() ? values.replyText.trim() : undefined,
    mediaId: hasComment && values.mediaId.trim() ? values.mediaId.trim() : undefined,
    maxDmsPerUserPer24h: values.maxDmsPerUserPer24h
      ? Number(values.maxDmsPerUserPer24h)
      : undefined,
    // Lead capture — the success/failure copy is only meaningful when it's on.
    collectEmail: values.collectEmail,
    emailSuccessMessage:
      values.collectEmail && values.emailSuccessMessage.trim()
        ? values.emailSuccessMessage.trim()
        : undefined,
    emailFailureMessage:
      values.collectEmail && values.emailFailureMessage.trim()
        ? values.emailFailureMessage.trim()
        : undefined,
    status: values.status,
  };
}

const EMPTY_FORM: AutomationFormValues = {
  instagramAccountId: '',
  name: '',
  triggerTypes: ['COMMENT_KEYWORD'],
  matchType: 'CONTAINS',
  keywords: '',
  dmText: '',
  replyText: '',
  mediaId: '',
  maxDmsPerUserPer24h: '',
  collectEmail: false,
  emailSuccessMessage: '',
  emailFailureMessage: '',
  status: 'ACTIVE',
};

/**
 * Visual post/reel picker for post-specific automations. Fetches the account's
 * recent media on demand and lets the user click a thumbnail to bind the rule to
 * one post/reel — replacing the old paste-a-media-id field. The selected id is
 * mirrored into a hidden form field by the parent.
 */
function MediaPicker({
  accountId,
  value,
  onChange,
}: {
  accountId: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const mediaQuery = useQuery({
    queryKey: ['instagram', 'media', accountId],
    queryFn: () => instagramApi.listMedia(accountId),
    enabled: open && Boolean(accountId),
    staleTime: 5 * 60 * 1000,
  });
  const media = mediaQuery.data ?? [];
  const selected = media.find((m) => m.id === value);

  const label = (m: InstagramMedia) =>
    m.mediaProductType === 'REELS' || m.mediaType === 'VIDEO' ? 'Reel' : 'Post';

  if (value) {
    return (
      <div className="mt-1 flex items-center gap-3 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800">
          {selected?.thumbnailUrl ? (
            <img
              src={selected.thumbnailUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-400">
              <ImageIcon className="h-5 w-5" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-slate-700 dark:text-slate-200">
            {selected?.caption?.trim() || `${selected ? label(selected) : 'Post'} selected`}
          </p>
          <p className="truncate text-xs text-slate-400">ID: {value}</p>
        </div>
        <button
          type="button"
          onClick={() => onChange('')}
          className="focus-ring shrink-0 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:text-red-600 dark:text-slate-400"
        >
          Clear
        </button>
      </div>
    );
  }

  return (
    <div className="mt-1 space-y-2">
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen((o) => !o)}>
        <ImageIcon className="mr-1.5 h-4 w-4" />
        {open ? 'Hide posts' : 'Choose a post or reel'}
      </Button>

      {open ? (
        <div className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
          {!accountId ? (
            <p className="p-3 text-sm text-slate-400">Select an Instagram account first.</p>
          ) : mediaQuery.isLoading ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="aspect-square w-full rounded-md" />
              ))}
            </div>
          ) : mediaQuery.isError ? (
            <p className="p-3 text-sm text-slate-400">
              Couldn&apos;t load posts. Try syncing the account, then reopen.
            </p>
          ) : media.length === 0 ? (
            <p className="p-3 text-sm text-slate-400">No posts found on this account yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {media.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                  title={m.caption ?? label(m)}
                  className="focus-ring group relative aspect-square overflow-hidden rounded-md border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
                >
                  {m.thumbnailUrl ? (
                    <img
                      src={m.thumbnailUrl}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-400">
                      <ImageIcon className="h-5 w-5" />
                    </div>
                  )}
                  {m.mediaProductType === 'REELS' || m.mediaType === 'VIDEO' ? (
                    <span className="absolute right-1 top-1 rounded bg-black/60 p-0.5 text-white">
                      <Film className="h-3 w-3" />
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function AutomationsPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AutomationRule | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AutomationRule | null>(null);

  const accountsQuery = useQuery({
    queryKey: ['instagram', 'accounts'],
    queryFn: instagramApi.listAccounts,
  });
  const rulesQuery = useQuery({
    queryKey: ['automations', 'rules'],
    queryFn: () => automationsApi.list(),
  });

  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const connectableAccounts = useMemo(
    () => accounts.filter((a) => a.status === 'CONNECTED' || a.status === 'NEEDS_RECONNECT'),
    [accounts],
  );
  const accountName = useMemo(() => {
    const map = new Map(accounts.map((a) => [a.id, a.username]));
    return (id: string) => map.get(id) ?? 'unknown account';
  }, [accounts]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AutomationFormValues>({
    resolver: zodResolver(automationRuleSchema),
    defaultValues: EMPTY_FORM,
  });
  const matchType = watch('matchType');
  const triggerTypes = watch('triggerTypes') ?? [];
  const hasComment = triggerTypes.includes('COMMENT_KEYWORD');
  const collectEmail = watch('collectEmail');
  const selectedAccountId = watch('instagramAccountId');
  const selectedMediaId = watch('mediaId');

  const openCreate = () => {
    reset({ ...EMPTY_FORM, instagramAccountId: connectableAccounts[0]?.id ?? '' });
    setEditing('new');
  };
  const openTemplate = (templateValues: Partial<AutomationFormValues>, mediaId?: string) => {
    reset({
      ...EMPTY_FORM,
      ...templateValues,
      instagramAccountId: connectableAccounts[0]?.id ?? '',
      ...(mediaId ? { mediaId } : {}),
    });
    setEditing('new');
  };
  const openEdit = (rule: AutomationRule) => {
    reset(toFormValues(rule));
    setEditing(rule);
  };
  const closeForm = () => setEditing(null);

  // Deep-link prefill: the Content page (and template links) open the builder via
  // ?template=&accountId=&mediaId=. Run once, after accounts have loaded so the
  // account id resolves, then strip the params so a refresh doesn't reopen it.
  const [searchParams, setSearchParams] = useSearchParams();
  const prefillDone = useRef(false);
  useEffect(() => {
    if (prefillDone.current || accountsQuery.isLoading) return;
    const templateId = searchParams.get('template');
    const mediaId = searchParams.get('mediaId');
    const accountId = searchParams.get('accountId');
    if (!templateId && !mediaId) return;
    prefillDone.current = true;

    const tpl = findTemplate(templateId);
    const resolvedAccount =
      accountId && connectableAccounts.some((a) => a.id === accountId)
        ? accountId
        : (connectableAccounts[0]?.id ?? '');
    reset({
      ...EMPTY_FORM,
      ...(tpl?.values ?? { triggerTypes: ['COMMENT_KEYWORD'], keywords: 'link, info' }),
      instagramAccountId: resolvedAccount,
      ...(mediaId ? { mediaId } : {}),
    });
    setEditing('new');
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountsQuery.isLoading]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['automations', 'rules'] });

  const saveMutation = useMutation({
    mutationFn: (values: AutomationFormValues) => {
      const payload = toPayload(values);
      if (editing && editing !== 'new') {
        // Account + trigger source are fixed after creation — omit them from updates.
        const { instagramAccountId: _omit, triggerTypes: _triggerTypes, ...rest } = payload;
        return automationsApi.update(editing.id, rest);
      }
      return automationsApi.create(payload);
    },
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: editing === 'new' ? 'Automation created' : 'Automation updated',
      });
      invalidate();
      closeForm();
    },
    onError: (error) => {
      const message = error instanceof ApiError ? error.message : 'Could not save the automation.';
      showToast({ variant: 'error', title: 'Save failed', description: message });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (rule: AutomationRule) =>
      automationsApi.update(rule.id, { status: rule.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' }),
    onSuccess: () => invalidate(),
    onError: (error) => {
      const message = error instanceof ApiError ? error.message : 'Could not update the status.';
      showToast({ variant: 'error', title: 'Update failed', description: message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => automationsApi.remove(id),
    onSuccess: () => {
      showToast({ variant: 'success', title: 'Automation deleted' });
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error) => {
      const message =
        error instanceof ApiError ? error.message : 'Could not delete the automation.';
      showToast({ variant: 'error', title: 'Delete failed', description: message });
      setDeleteTarget(null);
    },
  });

  const rules = rulesQuery.data ?? [];
  const hasConnectableAccount = connectableAccounts.length > 0;

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Automations
            </h1>
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              Auto-reply and DM people who comment on your posts.
            </p>
          </div>
          {hasConnectableAccount && editing === null ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              New automation
            </Button>
          ) : null}
        </div>

        {/* No connected account → can't build anything yet. */}
        {!accountsQuery.isLoading && !hasConnectableAccount ? (
          <EmptyState
            icon={Instagram}
            title="Connect an Instagram account first"
            description="Automations run on a connected Instagram business account. Connect one, then come back to build your first comment → DM rule."
            action={
              <Link to="/instagram/accounts">
                <Button>
                  <Instagram className="h-4 w-4" />
                  Go to Instagram accounts
                </Button>
              </Link>
            }
          />
        ) : null}

        {/* Template gallery — quick-start presets. */}
        {editing === null && hasConnectableAccount ? (
          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              Start from a template
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {AUTOMATION_TEMPLATES.map((tpl) => {
                const Icon = tpl.icon;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => openTemplate(tpl.values)}
                    className="focus-ring group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-brand-700 dark:hover:bg-brand-950/30"
                  >
                    <span className="brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {tpl.name}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          {tpl.badge}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                        {tpl.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-center text-xs text-slate-400">
              or{' '}
              <button
                type="button"
                onClick={openCreate}
                className="font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                build one from scratch
              </button>
            </p>
          </div>
        ) : null}

        {/* Create / edit form */}
        {editing !== null ? (
          <Card>
            <CardHeader className="flex items-center justify-between">
              <div>
                <CardTitle>{editing === 'new' ? 'New automation' : 'Edit automation'}</CardTitle>
                <CardDescription>
                  When a comment matches, we send a DM (and optionally a public reply).
                </CardDescription>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="focus-ring rounded-md p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="Close form"
              >
                <X className="h-5 w-5" />
              </button>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={handleSubmit((values) => saveMutation.mutate(values))}
                noValidate
                className="space-y-4"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="instagramAccountId">Instagram account</Label>
                    <Select
                      id="instagramAccountId"
                      error={errors.instagramAccountId?.message}
                      disabled={editing !== 'new'}
                      {...register('instagramAccountId')}
                    >
                      <option value="">Select an account…</option>
                      {connectableAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          @{a.username}
                        </option>
                      ))}
                    </Select>
                    <FieldError message={errors.instagramAccountId?.message} />
                  </div>
                  <div>
                    <Label htmlFor="name">Automation name</Label>
                    <Input
                      id="name"
                      placeholder="e.g. Price replies"
                      error={errors.name?.message}
                      {...register('name')}
                    />
                    <FieldError message={errors.name?.message} />
                  </div>
                </div>

                <div>
                  <Label htmlFor="triggerTypes">Trigger sources</Label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {TRIGGER_OPTIONS.map((o) => (
                      <label
                        key={o.value}
                        className={`focus-ring flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm ${
                          triggerTypes.includes(o.value)
                            ? 'border-brand-400 bg-brand-50 dark:border-brand-600 dark:bg-brand-950'
                            : 'border-slate-300 dark:border-slate-600'
                        } ${editing !== 'new' ? 'cursor-not-allowed opacity-60' : ''}`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 accent-brand-600"
                          value={o.value}
                          disabled={editing !== 'new'}
                          {...register('triggerTypes')}
                        />
                        <span>
                          <span className="block font-medium text-slate-700 dark:text-slate-200">
                            {o.label}
                          </span>
                          <span className="block text-xs text-slate-400">{o.hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <FieldError message={errors.triggerTypes?.message} />
                  <p className="mt-1 text-xs text-slate-400">
                    Pick one or more. The same keyword + DM applies to every selected source.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="matchType">Match type</Label>
                    <Select id="matchType" {...register('matchType')}>
                      {MATCH_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="keywords">Keywords (comma-separated)</Label>
                    <Input
                      id="keywords"
                      placeholder="price, link, info"
                      disabled={matchType === 'ANY'}
                      error={errors.keywords?.message}
                      {...register('keywords')}
                    />
                    <FieldError message={errors.keywords?.message} />
                  </div>
                </div>

                <div>
                  <Label htmlFor="dmText">DM to send</Label>
                  <Textarea
                    id="dmText"
                    rows={3}
                    placeholder="Hey {{username}}! Here's the link you asked for: https://…"
                    error={errors.dmText?.message}
                    {...register('dmText')}
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    Use <code className="font-mono">{'{{username}}'}</code> to insert the
                    commenter&apos;s name.
                  </p>
                  <FieldError message={errors.dmText?.message} />
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                  <label htmlFor="collectEmail" className="flex cursor-pointer items-start gap-3">
                    <input
                      id="collectEmail"
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-fuchsia-600 focus:ring-fuchsia-500"
                      {...register('collectEmail')}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">
                        Collect email as a lead
                      </span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">
                        After the DM is sent, the contact&apos;s next reply is read as their email
                        and saved to their contact record.
                      </span>
                    </span>
                  </label>

                  {collectEmail ? (
                    <div className="mt-3 grid gap-3">
                      <div>
                        <Label htmlFor="emailSuccessMessage">Confirmation DM (after email saved)</Label>
                        <Textarea
                          id="emailSuccessMessage"
                          rows={2}
                          placeholder="Got it! Check your inbox 🎉"
                          error={errors.emailSuccessMessage?.message}
                          {...register('emailSuccessMessage')}
                        />
                        <FieldError message={errors.emailSuccessMessage?.message} />
                      </div>
                      <div>
                        <Label htmlFor="emailFailureMessage">Retry DM (when it&apos;s not an email)</Label>
                        <Textarea
                          id="emailFailureMessage"
                          rows={2}
                          placeholder="Hmm, that doesn't look like an email — mind trying again?"
                          error={errors.emailFailureMessage?.message}
                          {...register('emailFailureMessage')}
                        />
                        <FieldError message={errors.emailFailureMessage?.message} />
                      </div>
                    </div>
                  ) : null}
                </div>

                {hasComment ? (
                  <div>
                    <Label htmlFor="replyText">Public comment reply (optional)</Label>
                    <Textarea
                      id="replyText"
                      rows={2}
                      placeholder="Sent you a DM! 📩"
                      error={errors.replyText?.message}
                      {...register('replyText')}
                    />
                    <FieldError message={errors.replyText?.message} />
                  </div>
                ) : null}

                {hasComment ? (
                  <div>
                    <Label htmlFor="mediaId">Run only on a specific post or reel (optional)</Label>
                    {/* keep the raw id in the form; the picker drives it visually */}
                    <input type="hidden" {...register('mediaId')} />
                    <MediaPicker
                      accountId={selectedAccountId}
                      value={selectedMediaId}
                      onChange={(id) => setValue('mediaId', id, { shouldDirty: true })}
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      Leave unset to run on comments across all your posts.
                    </p>
                    <FieldError message={errors.mediaId?.message} />
                  </div>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="maxDmsPerUserPer24h">Max DMs / person / 24h</Label>
                    <Input
                      id="maxDmsPerUserPer24h"
                      inputMode="numeric"
                      placeholder="1"
                      error={errors.maxDmsPerUserPer24h?.message}
                      {...register('maxDmsPerUserPer24h')}
                    />
                    <FieldError message={errors.maxDmsPerUserPer24h?.message} />
                  </div>
                </div>

                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select id="status" {...register('status')}>
                    <option value="ACTIVE">Active — runs immediately</option>
                    <option value="PAUSED">Paused — save but don&apos;t run yet</option>
                  </Select>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button type="submit" isLoading={saveMutation.isPending}>
                    {editing === 'new' ? 'Create automation' : 'Save changes'}
                  </Button>
                  <Button type="button" variant="ghost" onClick={closeForm}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {/* Rules list */}
        {rulesQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : rulesQuery.isError ? (
          <Card>
            <CardContent>
              <p className="text-sm text-red-600 dark:text-red-400">
                Could not load your automations.
              </p>
            </CardContent>
          </Card>
        ) : rules.length === 0 && hasConnectableAccount && editing === null ? (
          <EmptyState
            icon={Bot}
            title="No automations yet"
            description="Create a rule and we'll DM anyone who comments a matching keyword on your posts."
            action={
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Create your first automation
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <Card key={rule.id}>
                <CardContent className="space-y-3 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                        <span className="truncate">{rule.name}</span>
                        <StatusBadge status={rule.status} />
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        @{accountName(rule.instagramAccountId)} &middot; triggered{' '}
                        {rule.triggeredCount} time{rule.triggeredCount === 1 ? '' : 's'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        isLoading={
                          toggleMutation.isPending && toggleMutation.variables?.id === rule.id
                        }
                        onClick={() => toggleMutation.mutate(rule)}
                        title={rule.status === 'ACTIVE' ? 'Pause' : 'Activate'}
                      >
                        {rule.status === 'ACTIVE' ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(rule)} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(rule)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {(rule.triggerTypes ?? ['COMMENT_KEYWORD']).map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-1 font-medium text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                      >
                        {TRIGGER_LABELS[t] ?? t}
                      </span>
                    ))}
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <Zap className="h-3 w-3" />
                      {MATCH_TYPE_OPTIONS.find((o) => o.value === rule.matchType)?.label ??
                        rule.matchType}
                    </span>
                    {rule.matchType !== 'ANY' &&
                      rule.keywords.map((kw) => (
                        <span
                          key={kw}
                          className="rounded-md bg-brand-50 px-2 py-1 font-medium text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                        >
                          {kw}
                        </span>
                      ))}
                  </div>

                  <div className="space-y-1.5 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
                    <p className="flex gap-2 text-slate-700 dark:text-slate-200">
                      <Send className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                      <span className="min-w-0 break-words">{rule.dmText}</span>
                    </p>
                    {rule.replyText ? (
                      <p className="flex gap-2 text-slate-600 dark:text-slate-300">
                        <MessageSquareReply className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        <span className="min-w-0 break-words">{rule.replyText}</span>
                      </p>
                    ) : null}
                    {rule.collectEmail ? (
                      <p className="flex gap-2 text-slate-600 dark:text-slate-300">
                        <Mail className="mt-0.5 h-4 w-4 shrink-0 text-fuchsia-500" />
                        <span className="min-w-0 break-words">
                          Captures the lead&apos;s email from their reply
                        </span>
                      </p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete "${deleteTarget?.name ?? ''}"?`}
        description="This automation will stop running and be removed. This can't be undone."
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </PageTransition>
  );
}
