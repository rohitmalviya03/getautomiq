import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { instagramApi } from '@/lib/instagram-api';
import type { InstagramAccountStatus } from '@/types/api';

/** Account states that stop automations and need the user to reconnect. */
const BROKEN: InstagramAccountStatus[] = ['NEEDS_RECONNECT', 'TOKEN_EXPIRED', 'REVOKED', 'ERROR'];

/**
 * Site-wide alert shown across the dashboard when a connected Instagram account
 * has stopped working — otherwise automations fail silently and the user blames
 * the app. Rendered above the main content in DashboardLayout.
 */
export function ReconnectBanner() {
  const { data: accounts } = useQuery({
    queryKey: ['instagram', 'accounts'],
    queryFn: instagramApi.listAccounts,
    staleTime: 60 * 1000,
  });

  const broken = accounts?.filter((a) => BROKEN.includes(a.status)) ?? [];
  if (broken.length === 0) return null;

  const names = broken.map((a) => `@${a.username}`).slice(0, 2).join(', ');
  const extra = broken.length > 2 ? ` +${broken.length - 2} more` : '';

  return (
    <div className="border-b border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="min-w-0 flex-1 text-sm text-amber-800 dark:text-amber-200">
          <strong>
            {broken.length} account{broken.length === 1 ? '' : 's'} need reconnecting
          </strong>{' '}
          ({names}
          {extra}) — automations on {broken.length === 1 ? 'it' : 'them'} are paused.
        </p>
        <Link
          to="/instagram/accounts"
          className="focus-ring shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
        >
          Reconnect
        </Link>
      </div>
    </div>
  );
}
