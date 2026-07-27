import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { PublicShell } from '@/components/public/PublicShell';
import { useSeo } from '@/lib/use-seo';
import { TOOLS } from './tools-meta';

export function ToolsHubPage() {
  useSeo(
    'Free Instagram Tools — Hashtags, Captions & Engagement | Automiq',
    'Free Instagram tools for creators and businesses: hashtag generator, caption generator and engagement rate calculator. No login required.',
  );

  return (
    <PublicShell>
      <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <header className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-fuchsia-600">
            Free tools
          </span>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-5xl">
            Free Instagram tools that just work
          </h1>
          <p className="mt-4 text-lg text-slate-600 dark:text-slate-300">
            Generate hashtags, write captions, and check your engagement rate — instantly, in your
            browser. No sign-up, no limits.
          </p>
        </header>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map(({ slug, name, tagline, icon: Icon }) => (
            <Link
              key={slug}
              to={`/tools/${slug}`}
              className="group flex flex-col rounded-2xl border border-slate-200 bg-white/70 p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-glow dark:border-white/10 dark:bg-white/[0.04]"
            >
              <span className="brand-gradient flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-glow">
                <Icon className="h-6 w-6" />
              </span>
              <h2 className="mt-4 font-display text-lg font-bold text-slate-900 group-hover:text-brand-700 dark:text-white">
                {name}
              </h2>
              <p className="mt-1 flex-1 text-sm text-slate-500 dark:text-slate-400">{tagline}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 dark:text-brand-300">
                Open tool
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>

        <p className="mx-auto mt-12 max-w-2xl text-center text-sm text-slate-500 dark:text-slate-400">
          Automiq is an Instagram DM automation platform — auto-reply to comments, send links, and
          capture leads on autopilot.{' '}
          <Link to="/register" className="font-semibold text-brand-600 hover:underline">
            Start free →
          </Link>
        </p>
      </div>
    </PublicShell>
  );
}
