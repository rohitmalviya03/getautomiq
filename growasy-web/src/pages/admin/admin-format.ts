/** Minor units (paise/cents) → localized currency string. */
export function money(minor: number, currency = 'INR'): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(
      minor / 100,
    );
  } catch {
    return `${(minor / 100).toLocaleString()} ${currency}`;
  }
}

export function shortDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  TRIALING: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  PAST_DUE: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  CANCELED: 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300',
  EXPIRED: 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300',
  SUSPENDED: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  PENDING_VERIFICATION: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  CONNECTED: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
};

export function statusClass(status: string | null | undefined): string {
  return STATUS_STYLES[status ?? ''] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300';
}

export const PLAN_TIERS = ['FREE', 'STARTER', 'GROWTH', 'PROFESSIONAL', 'AGENCY', 'ENTERPRISE'] as const;
export const SUBSCRIPTION_STATUSES = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED'] as const;
