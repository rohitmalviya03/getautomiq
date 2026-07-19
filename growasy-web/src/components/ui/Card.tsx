import type { HTMLAttributes } from 'react';

export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white/80 shadow-sm shadow-brand-900/5 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04] ${className}`}
      {...rest}
    />
  );
}

export function CardHeader({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`border-b border-slate-200/70 px-6 py-4 dark:border-white/10 ${className}`}
      {...rest}
    />
  );
}

export function CardTitle({ className = '', ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={`text-base font-semibold text-slate-900 dark:text-slate-100 ${className}`}
      {...rest}
    />
  );
}

export function CardDescription({ className = '', ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={`mt-1 text-sm text-slate-500 dark:text-slate-400 ${className}`} {...rest} />;
}

export function CardContent({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`px-6 py-4 ${className}`} {...rest} />;
}
