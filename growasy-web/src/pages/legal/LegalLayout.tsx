import { type ReactNode } from 'react';
import { PublicShell } from '@/components/public/PublicShell';
import { useSeo } from '@/lib/use-seo';

/** Shared shell for the Privacy Policy and Terms pages. */
export function LegalLayout({
  title,
  seoTitle,
  seoDescription,
  updated,
  children,
}: {
  title: string;
  seoTitle: string;
  seoDescription: string;
  updated: string;
  children: ReactNode;
}) {
  useSeo(seoTitle, seoDescription);
  return (
    <PublicShell>
      <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 text-sm text-slate-400">Last updated: {updated}</p>
        <div className="legal-prose mt-8 space-y-6 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
          {children}
        </div>
      </article>
      <style>{`
        .legal-prose h2 { font-family: var(--ff-display, inherit); font-weight: 700; font-size: 1.15rem; color: inherit; margin-top: 1.5rem; }
        .legal-prose h2 { color: #1b1327; }
        :root.dark .legal-prose h2 { color: #f4eefb; }
        .legal-prose strong { color: inherit; font-weight: 600; }
        .legal-prose ul { list-style: disc; padding-left: 1.25rem; display: flex; flex-direction: column; gap: 0.4rem; }
        .legal-prose a { color: #8232d6; text-decoration: underline; }
      `}</style>
    </PublicShell>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2>{heading}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}
