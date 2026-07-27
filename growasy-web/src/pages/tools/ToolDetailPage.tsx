import { Link, Navigate, useParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { PublicShell, ToolCta } from '@/components/public/PublicShell';
import { useSeo, faqJsonLd, breadcrumbJsonLd } from '@/lib/use-seo';
import { TOOLS, findTool } from './tools-meta';

export function ToolDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const tool = findTool(slug);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://getautomiq.com';

  // Hooks must run unconditionally — fall back to a generic title if unknown.
  useSeo(
    tool?.metaTitle ?? 'Free Instagram Tools | Automiq',
    tool?.metaDescription ??
      'Free Instagram tools for creators and businesses — hashtag generator, caption generator and engagement rate calculator.',
    tool
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: tool.name,
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
            url: `${origin}/tools/${tool.slug}`,
            description: tool.metaDescription,
          },
          faqJsonLd(tool.faqs),
          breadcrumbJsonLd([
            { name: 'Home', url: `${origin}/` },
            { name: 'Free tools', url: `${origin}/tools` },
            { name: tool.shortName, url: `${origin}/tools/${tool.slug}` },
          ]),
        ]
      : undefined,
  );

  if (!tool) return <Navigate to="/tools" replace />;

  const { name, intro, Widget, faqs } = tool;
  const related = TOOLS.filter((t) => t.slug !== tool.slug);

  return (
    <PublicShell>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        {/* Breadcrumb (SEO + navigation) */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1 text-xs text-slate-400"
        >
          <Link to="/" className="hover:text-brand-600">
            Home
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link to="/tools" className="hover:text-brand-600">
            Free tools
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-slate-500 dark:text-slate-300">{tool.shortName}</span>
        </nav>

        <header className="mt-4">
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
            {name}
          </h1>
          <p className="mt-3 text-slate-600 dark:text-slate-300">{intro}</p>
        </header>

        <section className="mt-6" aria-label={name}>
          <Widget />
        </section>

        {/* FAQ — real text content for search engines */}
        <section className="mt-12">
          <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Frequently asked questions
          </h2>
          <div className="mt-4 space-y-3">
            {faqs.map((f) => (
              <details
                key={f.q}
                className="rounded-xl border border-slate-200 bg-white/70 px-5 py-1 dark:border-white/10 dark:bg-white/[0.03]"
              >
                <summary className="cursor-pointer list-none py-3 font-semibold text-slate-800 dark:text-slate-100">
                  {f.q}
                </summary>
                <p className="pb-4 text-sm text-slate-600 dark:text-slate-300">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Internal links to the other tools */}
        <section className="mt-12">
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            More free Instagram tools
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {related.map(({ slug: s, name: n, tagline, icon: Icon }) => (
              <Link
                key={s}
                to={`/tools/${s}`}
                className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white/70 p-4 transition-colors hover:border-brand-300 dark:border-white/10 dark:bg-white/[0.03]"
              >
                <span className="brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white">
                  <Icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block font-semibold text-slate-800 group-hover:text-brand-700 dark:text-slate-100">
                    {n}
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{tagline}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <ToolCta tool={tool.shortName.toLowerCase()} />
      </div>
    </PublicShell>
  );
}
