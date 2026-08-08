import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Clock } from 'lucide-react';
import { PublicShell } from '@/components/public/PublicShell';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { useSeo, SITE_URL } from '@/lib/use-seo';
import { blogApi, type BlogCard } from '@/lib/blog-api';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function PostCard({ post, featured = false }: { post: BlogCard; featured?: boolean }) {
  return (
    <article
      className={`group overflow-hidden rounded-2xl border border-slate-200 bg-white transition-shadow hover:shadow-lg dark:border-white/10 dark:bg-white/[0.03] ${
        featured ? 'sm:col-span-2 sm:grid sm:grid-cols-2' : ''
      }`}
    >
      <Link to={`/blog/${post.slug}`} className="block">
        <div className={`overflow-hidden bg-slate-100 dark:bg-slate-800 ${featured ? 'h-full min-h-[220px]' : 'aspect-[16/9]'}`}>
          {post.coverImageUrl ? (
            <img
              src={post.coverImageUrl}
              alt={post.coverImageAlt ?? ''}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="brand-gradient h-full w-full opacity-80" />
          )}
        </div>
      </Link>
      <div className="p-5">
        {post.tags.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {post.tags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-700 dark:bg-brand-950/50 dark:text-brand-300"
              >
                {t}
              </span>
            ))}
          </div>
        ) : null}
        <h2 className={`font-display font-bold text-slate-900 dark:text-white ${featured ? 'text-2xl' : 'text-lg'}`}>
          <Link to={`/blog/${post.slug}`} className="hover:text-brand-600 dark:hover:text-brand-300">
            {post.title}
          </Link>
        </h2>
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
          {post.summary}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          {post.publishedAt ? (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" /> {formatDate(post.publishedAt)}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {post.readingMinutes} min read
          </span>
          {post.authorName ? <span>· {post.authorName}</span> : null}
        </div>
      </div>
    </article>
  );
}

/**
 * Public blog index. Exists to be found: it's a top-level indexable route with
 * its own title, description and Blog structured data.
 */
export function BlogListPage() {
  const [page, setPage] = useState(1);

  const postsQuery = useQuery({
    queryKey: ['blog', 'list', page],
    queryFn: () => blogApi.list(page),
  });
  const posts = postsQuery.data?.items ?? [];

  useSeo(
    'Blog — Instagram automation guides & playbooks | Automiq',
    'Practical guides on Instagram automation, comment-to-DM funnels, lead capture and growth for creators and businesses.',
    {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: 'Automiq Blog',
      url: `${SITE_URL}/blog`,
      description:
        'Practical guides on Instagram automation, comment-to-DM funnels, lead capture and growth.',
    },
  );

  return (
    <PublicShell>
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <header className="mb-10 text-center">
          <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white sm:text-4xl">
            The Automiq blog
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-slate-600 dark:text-slate-300">
            Playbooks on Instagram automation, comment-to-DM funnels and turning conversations into
            customers.
          </p>
        </header>

        {postsQuery.isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-80 w-full rounded-2xl" />
            ))}
          </div>
        ) : postsQuery.isError ? (
          <p className="py-16 text-center text-slate-500">Couldn’t load posts. Please try again.</p>
        ) : posts.length === 0 ? (
          <p className="py-16 text-center text-slate-500 dark:text-slate-400">
            No posts published yet — check back soon.
          </p>
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2">
              {posts.map((p, i) => (
                // The newest post on page 1 gets the wide treatment.
                <PostCard key={p.id} post={p} featured={page === 1 && i === 0} />
              ))}
            </div>

            {(postsQuery.data?.hasMore || page > 1) && (
              <div className="mt-10 flex items-center justify-center gap-3">
                <Button variant="secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <span className="text-sm text-slate-500">Page {page}</span>
                <Button
                  variant="secondary"
                  disabled={!postsQuery.data?.hasMore}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </PublicShell>
  );
}
