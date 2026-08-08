import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Eye, ExternalLink, Plus, Save, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/toast-context';
import { ApiError } from '@/lib/api-client';
import { adminBlogApi, type BlogPostInput, type BlogStatus } from '@/lib/blog-api';
import { renderMarkdown } from '@/lib/markdown';
import { inputCls, labelCls, selectCls } from './pricing-ui';

const STATUS_STYLES: Record<BlogStatus, string> = {
  DRAFT: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  PUBLISHED: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  ARCHIVED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

interface Draft {
  title: string;
  slug: string;
  summary: string;
  content: string;
  status: BlogStatus;
  coverImageUrl: string;
  coverImageAlt: string;
  tags: string;
  seoTitle: string;
  seoDescription: string;
}

const EMPTY: Draft = {
  title: '',
  slug: '',
  summary: '',
  content:
    '## Start here\n\nWrite in Markdown. Headings, **bold**, *italic*, [links](https://example.com), lists, `code` and images all work.\n\n- First point\n- Second point\n',
  status: 'DRAFT',
  coverImageUrl: '',
  coverImageAlt: '',
  tags: '',
  seoTitle: '',
  seoDescription: '',
};

function toInput(draft: Draft): BlogPostInput {
  return {
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    content: draft.content,
    status: draft.status,
    // Blank strings are omitted so the server applies its own fallbacks
    // (slug from title, SEO from title/summary) instead of storing empties.
    ...(draft.slug.trim() ? { slug: draft.slug.trim() } : {}),
    ...(draft.coverImageUrl.trim() ? { coverImageUrl: draft.coverImageUrl.trim() } : {}),
    ...(draft.coverImageAlt.trim() ? { coverImageAlt: draft.coverImageAlt.trim() } : {}),
    ...(draft.seoTitle.trim() ? { seoTitle: draft.seoTitle.trim() } : {}),
    ...(draft.seoDescription.trim() ? { seoDescription: draft.seoDescription.trim() } : {}),
    tags: draft.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

function Editor({ postId, onDone }: { postId: string | 'new'; onDone: () => void }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [preview, setPreview] = useState(false);

  const existing = useQuery({
    queryKey: ['admin', 'blog', postId],
    queryFn: () => adminBlogApi.get(postId),
    enabled: postId !== 'new',
  });

  useEffect(() => {
    const p = existing.data;
    if (!p) return;
    setDraft({
      title: p.title,
      slug: p.slug,
      summary: p.summary,
      content: p.content,
      status: p.status,
      coverImageUrl: p.coverImageUrl ?? '',
      coverImageAlt: p.coverImageAlt ?? '',
      tags: p.tags.join(', '),
      seoTitle: p.seoTitle ?? '',
      seoDescription: p.seoDescription ?? '',
    });
  }, [existing.data]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const save = useMutation({
    mutationFn: () =>
      postId === 'new'
        ? adminBlogApi.create(toInput(draft))
        : adminBlogApi.update(postId, toInput(draft)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'blog'] });
      // The public reader caches its own list; drop it so a publish shows up.
      await queryClient.invalidateQueries({ queryKey: ['blog'] });
      showToast({
        variant: 'success',
        title: draft.status === 'PUBLISHED' ? 'Post published' : 'Draft saved',
      });
      onDone();
    },
    onError: (e) =>
      showToast({
        variant: 'error',
        title: 'Could not save',
        description: e instanceof ApiError ? e.message : undefined,
      }),
  });

  const isPublished = existing.data?.status === 'PUBLISHED';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onDone}
          className="focus-ring inline-flex items-center gap-1.5 rounded-md text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-4 w-4" /> All posts
        </button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setPreview((p) => !p)}>
            <Eye className="h-4 w-4" /> {preview ? 'Edit' : 'Preview'}
          </Button>
          <Button size="sm" isLoading={save.isPending} onClick={() => save.mutate()}>
            <Save className="h-4 w-4" /> Save
          </Button>
        </div>
      </div>

      {postId !== 'new' && existing.isLoading ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : preview ? (
        <Card>
          <CardContent className="py-6">
            <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white">
              {draft.title || 'Untitled'}
            </h1>
            <p className="mt-2 text-lg text-slate-600 dark:text-slate-300">{draft.summary}</p>
            {draft.coverImageUrl ? (
              <img
                src={draft.coverImageUrl}
                alt={draft.coverImageAlt}
                className="mt-6 aspect-[16/9] w-full rounded-xl object-cover"
              />
            ) : null}
            {/* Same renderer the public page uses, so preview can't lie. */}
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(draft.content) }} />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="space-y-4 py-5">
              <div>
                <label className={labelCls}>Title</label>
                <input
                  className={inputCls}
                  value={draft.title}
                  onChange={(e) => set('title', e.target.value)}
                  placeholder="How to turn Instagram comments into customers"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>URL slug</label>
                  <input
                    className={inputCls}
                    value={draft.slug}
                    disabled={isPublished}
                    onChange={(e) => set('slug', e.target.value)}
                    placeholder="auto-generated from the title"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    {isPublished
                      ? 'Locked — changing a live URL breaks inbound links and loses its ranking.'
                      : 'Leave blank to generate it from the title.'}
                  </p>
                </div>
                <div>
                  <label className={labelCls}>Status</label>
                  <select
                    className={selectCls}
                    value={draft.status}
                    onChange={(e) => set('status', e.target.value as BlogStatus)}
                  >
                    <option value="DRAFT">Draft — not visible publicly</option>
                    <option value="PUBLISHED">Published — live on the site</option>
                    <option value="ARCHIVED">Archived — hidden</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={labelCls}>Summary</label>
                <textarea
                  className={`${inputCls} min-h-[70px]`}
                  value={draft.summary}
                  onChange={(e) => set('summary', e.target.value)}
                  placeholder="One or two sentences. Shown on cards and used as the meta description."
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Cover image URL</label>
                  <input
                    className={inputCls}
                    value={draft.coverImageUrl}
                    onChange={(e) => set('coverImageUrl', e.target.value)}
                    placeholder="https://…"
                  />
                </div>
                <div>
                  <label className={labelCls}>Cover image alt text</label>
                  <input
                    className={inputCls}
                    value={draft.coverImageAlt}
                    onChange={(e) => set('coverImageAlt', e.target.value)}
                    placeholder="Describe the image"
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Tags (comma-separated)</label>
                <input
                  className={inputCls}
                  value={draft.tags}
                  onChange={(e) => set('tags', e.target.value)}
                  placeholder="automation, instagram, growth"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-5">
              <label className={labelCls}>Content (Markdown)</label>
              <textarea
                className={`${inputCls} min-h-[420px] font-mono text-[13px] leading-6`}
                value={draft.content}
                onChange={(e) => set('content', e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-400">
                Markdown only — raw HTML is shown as text, never executed. Use `## Heading`,
                `**bold**`, `[link](url)`, `![alt](image-url)`, `-` for lists.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 py-5">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Search engine listing
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>SEO title</label>
                  <input
                    className={inputCls}
                    value={draft.seoTitle}
                    onChange={(e) => set('seoTitle', e.target.value)}
                    placeholder="Falls back to the post title"
                  />
                </div>
                <div>
                  <label className={labelCls}>Meta description</label>
                  <input
                    className={inputCls}
                    value={draft.seoDescription}
                    onChange={(e) => set('seoDescription', e.target.value)}
                    placeholder="Falls back to the summary"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/** Blog authoring: list of posts, and the editor. */
export function AdminBlogPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const postsQuery = useQuery({
    queryKey: ['admin', 'blog', 'list'],
    queryFn: () => adminBlogApi.list(1),
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminBlogApi.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'blog'] });
      await queryClient.invalidateQueries({ queryKey: ['blog'] });
      setDeleteId(null);
      showToast({ variant: 'success', title: 'Post removed' });
    },
  });

  if (editing) return <Editor postId={editing} onDone={() => setEditing(null)} />;

  const posts = postsQuery.data?.items ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Blog</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Published posts appear at /blog on the public site.
          </p>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> New post
        </Button>
      </div>

      {postsQuery.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            No posts yet. Write the first one.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="divide-y divide-slate-200 p-0 dark:divide-white/10">
            {posts.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setEditing(p.id)}
                  className="focus-ring min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                    {p.title}
                  </span>
                  <span className="text-xs text-slate-400">
                    /{p.slug} · {p.readingMinutes} min · {p.viewCount} views
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${STATUS_STYLES[p.status]}`}
                  >
                    {p.status}
                  </span>
                  {p.status === 'PUBLISHED' ? (
                    <a
                      href={`/blog/${p.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="focus-ring rounded p-1 text-slate-400 hover:text-brand-600"
                      aria-label="View live"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setDeleteId(p.id)}
                    className="focus-ring rounded p-1 text-slate-400 hover:text-red-600"
                    aria-label="Delete post"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        title="Remove this post?"
        description="It disappears from the public blog immediately. The URL stays reserved so it can never be reused by another post."
        confirmLabel="Remove"
        cancelLabel="Keep"
        variant="danger"
        isLoading={remove.isPending}
        onConfirm={() => deleteId && remove.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
