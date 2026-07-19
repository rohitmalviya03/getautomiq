import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Instagram } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { PageTransition } from '@/components/ui/PageTransition';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { instagramApi } from '@/lib/instagram-api';

export function DashboardHome() {
  const user = useAuthStore((s) => s.user);
  const organizations = useAuthStore((s) => s.organizations);
  const activeOrganizationId = useAuthStore((s) => s.activeOrganizationId);
  const activeOrg = organizations.find((o) => o.id === activeOrganizationId);

  const {
    data: accounts,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['instagram', 'accounts'],
    queryFn: instagramApi.listAccounts,
  });

  const connectedCount = accounts?.filter((a) => a.status === 'CONNECTED').length ?? 0;

  return (
    <PageTransition>
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Welcome back{user ? `, ${user.firstName}` : ''}
        </h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">
          {activeOrg
            ? `You're working in ${activeOrg.name}.`
            : "You're not part of an organization yet."}
        </p>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Connected accounts</CardTitle>
            <CardDescription>Instagram business accounts in this workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : isError ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Could not load your Instagram accounts right now.
              </p>
            ) : !accounts || accounts.length === 0 ? (
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
                    <Instagram className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    No Instagram accounts connected yet.
                  </p>
                </div>
                <Link
                  to="/instagram/accounts"
                  className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
                >
                  Connect your first Instagram account
                </Link>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
                    <Instagram className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                      {connectedCount}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      connected {connectedCount === 1 ? 'account' : 'accounts'}
                      {accounts.length > connectedCount
                        ? ` · ${accounts.length - connectedCount} needing attention`
                        : ''}
                    </p>
                  </div>
                </div>
                <Link
                  to="/instagram/accounts"
                  className="focus-ring inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                >
                  Manage accounts
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
