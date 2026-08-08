import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Bot } from 'lucide-react';

/**
 * Shell for every auth screen (login, register, forgot/reset password, verify).
 *
 * The brand mark is a link home: someone who lands on /login from a shared URL
 * and isn't ready to sign in had no way back to the marketing site — the logo is
 * the first thing people click for that, so it has to be one.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 dark:bg-slate-950">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        <div className="mb-8 flex flex-col items-center text-center">
          <Link
            to="/"
            aria-label="Automiq home"
            className="focus-ring flex flex-col items-center rounded-2xl transition-transform hover:scale-[1.03]"
          >
            <span className="brand-gradient flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg shadow-brand-500/30">
              <Bot className="h-7 w-7" aria-hidden="true" />
            </span>
            <span className="brand-gradient-text mt-3 text-2xl font-bold tracking-tight">
              Automiq
            </span>
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
          {subtitle ? (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
          ) : null}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
          {children}
        </div>
        <div className="mt-6 text-center">
          <Link
            to="/"
            className="focus-ring inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-300"
          >
            <ArrowLeft className="h-4 w-4" /> Back to home
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
