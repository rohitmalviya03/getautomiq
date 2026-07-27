import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bot } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/auth-store';

const TOOL_LINKS = [
  { to: '/tools/instagram-hashtag-generator', label: 'Hashtag Generator' },
  { to: '/tools/instagram-caption-generator', label: 'Caption Generator' },
  { to: '/tools/engagement-rate-calculator', label: 'Engagement Calculator' },
];

/** Public marketing shell (nav + footer) for logged-out, SEO-facing pages. */
export function PublicShell({ children }: { children: ReactNode }) {
  const authed = useAuthStore((s) => s.status === 'authenticated');

  return (
    <div className="flex min-h-screen flex-col">
      <nav className="glass sticky top-0 z-40 border-x-0 border-t-0 border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="brand-gradient flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-glow">
              <Bot className="h-5 w-5" />
            </span>
            <span className="brand-gradient-text font-display text-xl font-bold tracking-tight">
              Automiq
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/tools"
              className="hidden text-sm font-medium text-slate-600 hover:text-brand-700 dark:text-slate-300 sm:block"
            >
              Free tools
            </Link>
            <Link
              to="/#pricing"
              className="hidden text-sm font-medium text-slate-600 hover:text-brand-700 dark:text-slate-300 sm:block"
            >
              Pricing
            </Link>
            <Link
              to="/waitlist"
              className="hidden text-sm font-medium text-slate-600 hover:text-brand-700 dark:text-slate-300 sm:block"
            >
             Join Waitlist
            </Link>
            {authed ? (
              <Link to="/dashboard">
                <Button size="sm">Dashboard</Button>
              </Link>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost" size="sm">
                    Log in
                  </Button>
                </Link>
                <Link to="/register">
                  <Button size="sm">Start free</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-slate-200/70 py-10 dark:border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link to="/" className="flex items-center gap-2">
              <span className="brand-gradient flex h-7 w-7 items-center justify-center rounded-lg text-white">
                <Bot className="h-4 w-4" />
              </span>
              <span className="brand-gradient-text font-display font-bold">Automiq</span>
            </Link>
            <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500 dark:text-slate-400">
              {TOOL_LINKS.map((l) => (
                <Link key={l.to} to={l.to} className="hover:text-brand-600">
                  {l.label}
                </Link>
              ))}
              <Link to="/#pricing" className="hover:text-brand-600">
                Pricing
              </Link>
              <Link to="/privacy" className="hover:text-brand-600">
                Privacy
              </Link>
              <Link to="/terms" className="hover:text-brand-600">
                Terms
              </Link>
            </nav>
          </div>
          <p className="text-xs text-slate-400">
            © 2026 Automiq · Free Instagram tools for creators &amp; businesses.
          </p>
        </div>
      </footer>
    </div>
  );
}

/** Shared "convert to signup" band used at the bottom of each tool page. */
export function ToolCta({ tool }: { tool: string }) {
  const authed = useAuthStore((s) => s.status === 'authenticated');
  return (
    <div className="mt-10 rounded-2xl bg-gradient-to-br from-brand-600 to-fuchsia-600 p-8 text-center text-white shadow-glow">
      <h2 className="font-display text-2xl font-bold">Loved the {tool}?</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-white/90">
        Automiq turns your Instagram comments into customers — auto-reply, DM links, and capture
        leads on autopilot. Start free, no card needed.
      </p>
      <Link to={authed ? '/dashboard' : '/register'} className="mt-5 inline-block">
        <Button className="!bg-white !text-brand-700 hover:!brightness-105">
          {authed ? 'Go to dashboard' : 'Start free'}
        </Button>
      </Link>
    </div>
  );
}
