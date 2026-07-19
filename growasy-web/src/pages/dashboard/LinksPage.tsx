import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Check,
  Copy,
  ExternalLink,
  Link2,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { PageTransition } from '@/components/ui/PageTransition';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Label, FieldError } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/toast-context';
import { linksApi } from '@/lib/links-api';
import { ApiError } from '@/lib/api-client';
import type { CreateLinkPayload, TrackedLink } from '@/types/api';

const linkSchema = z.object({
  destinationUrl: z
    .string()
    .min(1, 'Where should this link go?')
    .url('Enter a valid URL including https://'),
  title: z.string().max(255).optional().default(''),
  slug: z
    .string()
    .max(32)
    .optional()
    .default('')
    .refine((v) => v === '' || /^[a-zA-Z0-9_-]{3,32}$/.test(v), {
      message: '3–32 chars: letters, numbers, - and _',
    }),
});

type LinkFormValues = z.infer<typeof linkSchema>;

const EMPTY_FORM: LinkFormValues = { destinationUrl: '', title: '', slug: '' };

export function LinksPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<TrackedLink | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TrackedLink | null>(null);
  const [statsFor, setStatsFor] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const linksQuery = useQuery({ queryKey: ['links'], queryFn: () => linksApi.list() });
  const links = useMemo(() => linksQuery.data ?? [], [linksQuery.data]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LinkFormValues>({ resolver: zodResolver(linkSchema), defaultValues: EMPTY_FORM });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['links'] });

  const saveMutation = useMutation({
    mutationFn: (values: LinkFormValues) => {
      const payload: CreateLinkPayload = {
        destinationUrl: values.destinationUrl.trim(),
        title: values.title.trim() || undefined,
      };
      if (editing === 'new') {
        return linksApi.create({ ...payload, slug: values.slug.trim() || undefined });
      }
      return linksApi.update((editing as TrackedLink).id, payload);
    },
    onSuccess: () => {
      showToast({ title: editing === 'new' ? 'Link created' : 'Link updated', variant: 'success' });
      setEditing(null);
      invalidate();
    },
    onError: (err) => {
      showToast({
        title: 'Could not save link',
        description: err instanceof ApiError ? err.message : 'Something went wrong',
        variant: 'error',
      });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (link: TrackedLink) => linksApi.update(link.id, { isActive: !link.isActive }),
    onSuccess: () => invalidate(),
    onError: () => showToast({ title: 'Could not update link', variant: 'error' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => linksApi.remove(id),
    onSuccess: () => {
      showToast({ title: 'Link deleted', variant: 'success' });
      setDeleteTarget(null);
      invalidate();
    },
    onError: () => showToast({ title: 'Could not delete link', variant: 'error' }),
  });

  const openCreate = () => {
    reset(EMPTY_FORM);
    setEditing('new');
  };
  const openEdit = (link: TrackedLink) => {
    reset({ destinationUrl: link.destinationUrl, title: link.title ?? '', slug: link.slug });
    setEditing(link);
  };

  const copy = async (link: TrackedLink) => {
    try {
      await navigator.clipboard.writeText(link.shortUrl);
      setCopiedId(link.id);
      setTimeout(() => setCopiedId((c) => (c === link.id ? null : c)), 1500);
    } catch {
      showToast({ title: 'Copy failed — copy it manually', variant: 'error' });
    }
  };

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Links</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Create trackable short links to drop in your DMs and bio — see every click.
            </p>
          </div>
          {editing === null ? (
            <Button onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" /> New link
            </Button>
          ) : null}
        </div>

        {editing !== null ? (
          <Card>
            <CardHeader className="flex items-center justify-between">
              <div>
                <CardTitle>{editing === 'new' ? 'New link' : 'Edit link'}</CardTitle>
                <CardDescription>
                  {editing === 'new'
                    ? 'We generate a short link that redirects to your destination and counts clicks.'
                    : 'The short code stays the same — only the destination and title change.'}
                </CardDescription>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
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
                <div>
                  <Label htmlFor="destinationUrl">Destination URL</Label>
                  <Input
                    id="destinationUrl"
                    placeholder="https://mystore.com/summer-sale"
                    error={errors.destinationUrl?.message}
                    {...register('destinationUrl')}
                  />
                  <FieldError message={errors.destinationUrl?.message} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="title">Title (optional)</Label>
                    <Input
                      id="title"
                      placeholder="Summer sale landing page"
                      error={errors.title?.message}
                      {...register('title')}
                    />
                    <FieldError message={errors.title?.message} />
                  </div>
                  {editing === 'new' ? (
                    <div>
                      <Label htmlFor="slug">Custom short code (optional)</Label>
                      <Input id="slug" placeholder="summer" error={errors.slug?.message} {...register('slug')} />
                      <FieldError message={errors.slug?.message} />
                    </div>
                  ) : null}
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" isLoading={saveMutation.isPending}>
                    {editing === 'new' ? 'Create link' : 'Save changes'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {linksQuery.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        ) : links.length === 0 ? (
          <EmptyState
            icon={Link2}
            title="No links yet"
            description="Create your first trackable link to start measuring clicks."
            action={
              editing === null ? (
                <Button onClick={openCreate}>
                  <Plus className="mr-1.5 h-4 w-4" /> New link
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {links.map((link) => (
              <LinkCard
                key={link.id}
                link={link}
                copied={copiedId === link.id}
                statsOpen={statsFor === link.id}
                onCopy={() => copy(link)}
                onToggleStats={() => setStatsFor((s) => (s === link.id ? null : link.id))}
                onToggleActive={() => toggleMutation.mutate(link)}
                onEdit={() => openEdit(link)}
                onDelete={() => setDeleteTarget(link)}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete this link?`}
        description="The short link will stop redirecting and its click history is removed. This can't be undone."
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </PageTransition>
  );
}

function LinkCard({
  link,
  copied,
  statsOpen,
  onCopy,
  onToggleStats,
  onToggleActive,
  onEdit,
  onDelete,
}: {
  link: TrackedLink;
  copied: boolean;
  statsOpen: boolean;
  onCopy: () => void;
  onToggleStats: () => void;
  onToggleActive: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate font-semibold text-slate-900 dark:text-white">
                {link.title || link.destinationUrl}
              </p>
              {!link.isActive ? (
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  Paused
                </span>
              ) : null}
            </div>
            <a
              href={link.destinationUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-xs text-slate-500 hover:text-brand-600 dark:text-slate-400"
            >
              <span className="truncate">{link.destinationUrl}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          </div>
          <div className="flex items-center gap-4 text-right">
            <div>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{link.clickCount}</p>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Clicks</p>
            </div>
            <div>
              <p className="text-lg font-bold text-slate-900 dark:text-white">
                {link.uniqueClickCount}
              </p>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Unique</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
          <code className="min-w-0 flex-1 truncate px-1 font-mono text-sm text-brand-700 dark:text-brand-300">
            {link.shortUrl}
          </code>
          <button
            type="button"
            onClick={onCopy}
            className="focus-ring inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-600 shadow-sm hover:text-brand-600 dark:bg-slate-700 dark:text-slate-200"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onToggleStats}>
            <BarChart3 className="mr-1 h-3.5 w-3.5" />
            {statsOpen ? 'Hide stats' : 'Stats'}
          </Button>
          <Button variant="ghost" size="sm" onClick={onToggleActive}>
            {link.isActive ? (
              <>
                <Pause className="mr-1 h-3.5 w-3.5" /> Pause
              </>
            ) : (
              <>
                <Play className="mr-1 h-3.5 w-3.5" /> Resume
              </>
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-red-600 hover:text-red-700 dark:text-red-400"
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
          </Button>
        </div>

        {statsOpen ? <LinkStats linkId={link.id} /> : null}
      </CardContent>
    </Card>
  );
}

function LinkStats({ linkId }: { linkId: string }) {
  const statsQuery = useQuery({
    queryKey: ['links', linkId, 'stats'],
    queryFn: () => linksApi.stats(linkId, 30),
  });

  if (statsQuery.isLoading) {
    return <Skeleton className="h-32 w-full rounded-lg" />;
  }
  if (!statsQuery.data) return null;

  const { clicksPerDay, topReferrers, clicksInRange, rangeDays } = statsQuery.data;
  const max = Math.max(1, ...clicksPerDay.map((d) => d.count));

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
        {clicksInRange} click{clicksInRange === 1 ? '' : 's'} in the last {rangeDays} days
      </p>

      {/* Single-series daily clicks — magnitude over time, brand hue, hover for exact count. */}
      <div className="flex h-24 items-end gap-[2px]" role="img" aria-label="Clicks per day">
        {clicksPerDay.map((d) => (
          <div
            key={d.date}
            title={`${d.date}: ${d.count} click${d.count === 1 ? '' : 's'}`}
            className="flex-1 rounded-t-[3px] bg-brand-500/80 transition-colors hover:bg-brand-500"
            style={{ height: `${Math.max(3, (d.count / max) * 100)}%` }}
          />
        ))}
      </div>

      {topReferrers.length > 0 ? (
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            Top referrers
          </p>
          <ul className="space-y-1">
            {topReferrers.map((r) => (
              <li
                key={r.referrer}
                className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-300"
              >
                <span className="truncate">{r.referrer}</span>
                <span className="font-medium">{r.count}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
