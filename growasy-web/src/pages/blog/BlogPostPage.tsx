import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, Clock } from 'lucide-react';
import { PublicShell } from '@/components/public/PublicShell';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { useSeo, breadcrumbJsonLd, SITE_URL } from '@/lib/use-seo';
import { renderMarkdown } from '@/lib/markdown';
import { blogApi } from '@/lib/blog-api';
import { ShareButtons } from '@/components/blog/ShareButtons';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * A single article.
 *
 * The body is Markdown rendered through an escape-first converter — every
 * character is HTML-escaped before any tag is produced, so stored content can't
 * introduce elements or attributes. That is what makes the
 * `dangerouslySetInnerHTML` below safe rather than a liability.
 */
export function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();

  const postQuery = useQuery({
    queryKey: ['blog', 'post', slug],
    queryFn: () => blogApi.detail(slug!),
    enabled: Boolean(slug),
    retry: false,
  });
  const post = postQuery.data;

  const canonical = `${SITE_URL}/blog/${slug ?? ''}`;
  useSeo(
    post ? (post.seoTitle ?? `${post.title} | Automiq`) : 'Blog | Automiq',
    post ? (post.seoDescription ?? post.summary) : undefined,
    post
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: post.title,
            description: post.seoDescription ?? post.summary,
            url: canonical,
            datePublished: post.publishedAt ?? undefined,
            dateModified: post.updatedAt,
            ...(post.coverImageUrl ? { image: post.coverImageUrl } : {}),
            ...(post.authorName
              ? { author: { '@type': 'Person', name: post.authorName } }
              : {}),
            publisher: { '@id': `${SITE_URL}/#org` },
            mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
          },
          breadcrumbJsonLd([
            { name: 'Home', url: `${SITE_URL}/` },
            { name: 'Blog', url: `${SITE_URL}/blog` },
            { name: post.title, url: canonical },
          ]),
        ]
      : undefined,
  );

  return (
    <PublicShell>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Link
          to="/blog"
          className="focus-ring mb-6 inline-flex items-center gap-1.5 rounded-md text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-4 w-4" /> All posts
        </Link>

        {postQuery.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-3/4 rounded-lg" />
            <Skeleton className="aspect-[16/9] w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        ) : postQuery.isError || !post ? (
          <div className="py-20 text-center">
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              Post not found
            </h1>
            <p className="mt-2 text-slate-500 dark:text-slate-400">
              It may have been moved or unpublished.
            </p>
            <Link to="/blog" className="mt-6 inline-block">
              <Button variant="secondary">Back to the blog</Button>
            </Link>
          </div>
        ) : (
          <article>
            <header className="mb-8">
              {post.tags.length > 0 ? (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {post.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-700 dark:bg-brand-950/50 dark:text-brand-300"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
              <h1 className="font-display text-3xl font-bold leading-tight text-slate-900 dark:text-white sm:text-4xl">
                {post.title}
              </h1>
              <p className="mt-3 text-lg leading-7 text-slate-600 dark:text-slate-300">
                {post.summary}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                {post.authorName ? <span>{post.authorName}</span> : null}
                {post.publishedAt ? (
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-4 w-4" /> {formatDate(post.publishedAt)}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-4 w-4" /> {post.readingMinutes} min read
                </span>
              </div>
              <div className="mt-5 border-t border-slate-200 pt-4 dark:border-white/10">
                <ShareButtons url={canonical} title={post.title} />
              </div>
            </header>

            {post.coverImageUrl ? (
              <img
                src={post.coverImageUrl}
                alt={post.coverImageAlt ?? ''}
                className="mb-8 aspect-[16/9] w-full rounded-2xl object-cover"
              />
            ) : null}

            {/* Safe: renderMarkdown escapes all input before emitting any tag. */}
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content) }} />

            {/* Repeated at the end — people share once they've finished reading. */}
            <div className="mt-10 border-t border-slate-200 pt-6 dark:border-white/10">
              <ShareButtons url={canonical} title={post.title} />
            </div>

            <div className="mt-12 rounded-2xl border border-slate-200 p-6 text-center dark:border-white/10">
              <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                Turn your comments into conversations
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-300">
                Automiq replies to Instagram comments and DMs automatically, and captures the lead
                while you sleep.
              </p>
              <Link to="/register" className="mt-4 inline-block">
                <Button>Start free</Button>
              </Link>
            </div>

            {post.related.length > 0 ? (
              <section className="mt-12">
                <h2 className="mb-4 font-display text-lg font-bold text-slate-900 dark:text-white">
                  Keep reading
                </h2>
                <ul className="space-y-3">
                  {post.related.map((r) => (
                    <li key={r.id}>
                      <Link
                        to={`/blog/${r.slug}`}
                        className="focus-ring block rounded-xl border border-slate-200 p-4 transition-colors hover:border-brand-400 dark:border-white/10"
                      >
                        <p className="font-medium text-slate-800 dark:text-slate-100">{r.title}</p>
                        <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
                          {r.summary}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </article>
        )}
      </div>
    </PublicShell>
  );
}
