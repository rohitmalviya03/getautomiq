import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Instagram, Plug, RefreshCw, ServerCrash, Sparkles, Unplug } from 'lucide-react';
import { PageTransition } from '@/components/ui/PageTransition';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/toast-context';
import { instagramApi } from '@/lib/instagram-api';
import { ApiError } from '@/lib/api-client';
import type { InstagramAccount, InstagramAccountStatus } from '@/types/api';

const STATUS_BADGES: Record<InstagramAccountStatus, { label: string; className: string }> = {
  CONNECTED: {
    label: 'Connected',
    className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  },
  NEEDS_RECONNECT: {
    label: 'Reconnect soon',
    className: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  },
  TOKEN_EXPIRED: {
    label: 'Token expired',
    className: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  },
  REVOKED: {
    label: 'Access revoked',
    className: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  },
  DISCONNECTED: {
    label: 'Disconnected',
    className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  },
  ERROR: {
    label: 'Error',
    className: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  },
};

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

function AccountAvatar({ account }: { account: InstagramAccount }) {
  if (account.profilePictureUrl) {
    return (
      <img
        src={account.profilePictureUrl}
        alt=""
        className="h-12 w-12 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100 text-lg font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
      {account.username.charAt(0).toUpperCase()}
    </span>
  );
}

function StatusBadge({ status }: { status: InstagramAccountStatus }) {
  const badge = STATUS_BADGES[status];
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
      data-testid="status-badge"
    >
      {badge.label}
    </span>
  );
}

export function InstagramAccountsPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [disconnectTarget, setDisconnectTarget] = useState<InstagramAccount | null>(null);
  const [connectError, setConnectError] = useState<ApiError | null>(null);

  const {
    data: accounts,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['instagram', 'accounts'],
    queryFn: instagramApi.listAccounts,
  });

  // Mount-time probe so a server without Meta credentials shows the "not
  // configured" callout immediately instead of on the first failed click.
  const oauthProbe = useQuery({
    queryKey: ['instagram', 'oauth-url'],
    queryFn: () => instagramApi.getOAuthUrl(),
    retry: false,
    staleTime: Infinity,
    // The url from the probe is never reused for the redirect (its state token
    // is short-lived) — the connect mutation always fetches a fresh one.
  });

  const connectMutation = useMutation({
    mutationFn: () => instagramApi.getOAuthUrl(),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
    onError: (error) => {
      if (error instanceof ApiError && (error.status === 503 || error.status === 403)) {
        setConnectError(error);
      }
      const message =
        error instanceof ApiError ? error.message : 'Could not start the Instagram connection.';
      showToast({ variant: 'error', title: 'Connection failed', description: message });
    },
  });

  const reconnectMutation = useMutation({
    mutationFn: (id: string) => instagramApi.getOAuthUrl(id),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
    onError: (error) => {
      const message =
        error instanceof ApiError ? error.message : 'Could not start the reconnection.';
      showToast({ variant: 'error', title: 'Reconnect failed', description: message });
    },
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => instagramApi.syncAccount(id),
    onSuccess: (account) => {
      showToast({
        variant: 'success',
        title: 'Account synced',
        description: `@${account.username} is up to date.`,
      });
      queryClient.invalidateQueries({ queryKey: ['instagram', 'accounts'] });
    },
    onError: (error) => {
      const message = error instanceof ApiError ? error.message : 'Could not sync that account.';
      showToast({ variant: 'error', title: 'Sync failed', description: message });
      // A dead token flips the account's status to ERROR server-side — refetch
      // so the badge reflects it.
      queryClient.invalidateQueries({ queryKey: ['instagram', 'accounts'] });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => instagramApi.disconnectAccount(id),
    onSuccess: () => {
      showToast({ variant: 'success', title: 'Account disconnected' });
      setDisconnectTarget(null);
      queryClient.invalidateQueries({ queryKey: ['instagram', 'accounts'] });
    },
    onError: (error) => {
      const message =
        error instanceof ApiError ? error.message : 'Could not disconnect that account.';
      showToast({ variant: 'error', title: 'Disconnect failed', description: message });
      setDisconnectTarget(null);
    },
  });

  const probeError = oauthProbe.error instanceof ApiError ? oauthProbe.error : null;
  const notConfigured =
    probeError?.status === 503 || (connectError !== null && connectError.status === 503);
  const planLimitError =
    connectError?.status === 403 ? connectError : probeError?.status === 403 ? probeError : null;

  const connectButton = (
    <Button
      isLoading={connectMutation.isPending}
      disabled={notConfigured}
      onClick={() => connectMutation.mutate()}
    >
      <Plug className="h-4 w-4" />
      Connect Instagram account
    </Button>
  );

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Instagram accounts
            </h1>
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              Business accounts connected to this workspace.
            </p>
          </div>
          {connectButton}
        </div>

        {notConfigured ? (
          <div
            role="status"
            className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900 dark:bg-sky-950"
          >
            <ServerCrash
              className="mt-0.5 h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium text-sky-800 dark:text-sky-200">
                Meta app credentials are not configured yet
              </p>
              <p className="mt-1 text-sm text-sky-700 dark:text-sky-300">
                Connecting Instagram accounts requires the server to be configured with a Meta app.
                Set <code className="font-mono text-xs">META_APP_ID</code> and{' '}
                <code className="font-mono text-xs">META_APP_SECRET</code> on the API server, then
                reload this page.
              </p>
            </div>
          </div>
        ) : null}

        {planLimitError ? (
          <div
            role="status"
            className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950"
          >
            <Sparkles
              className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                {planLimitError.message}
              </p>
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                Upgrade your plan to connect more Instagram accounts.
              </p>
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : isError ? (
          <Card>
            <CardContent>
              <p className="text-sm text-red-600 dark:text-red-400">
                Could not load your Instagram accounts.
              </p>
            </CardContent>
          </Card>
        ) : !accounts || accounts.length === 0 ? (
          <EmptyState
            icon={Instagram}
            title="No Instagram accounts connected"
            description="Connect an Instagram business account to start automating replies, DMs, and engagement."
            action={notConfigured ? undefined : connectButton}
          />
        ) : (
          <div className="space-y-3">
            {accounts.map((account) => (
              <Card key={account.id}>
                <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <AccountAvatar account={account} />
                    <div>
                      <p className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                        @{account.username}
                        <StatusBadge status={account.status} />
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {account.name ?? 'Instagram business account'} &middot; last synced{' '}
                        {formatRelativeTime(account.lastSyncedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {account.status === 'CONNECTED' ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        isLoading={syncMutation.isPending && syncMutation.variables === account.id}
                        onClick={() => syncMutation.mutate(account.id)}
                      >
                        <RefreshCw className="h-4 w-4" />
                        Sync
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        isLoading={
                          reconnectMutation.isPending && reconnectMutation.variables === account.id
                        }
                        onClick={() => reconnectMutation.mutate(account.id)}
                      >
                        <Plug className="h-4 w-4" />
                        Reconnect
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setDisconnectTarget(account)}>
                      <Unplug className="h-4 w-4" />
                      Disconnect
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={disconnectTarget !== null}
        title={`Disconnect @${disconnectTarget?.username ?? ''}?`}
        description="Automations tied to this account will stop running. You can reconnect it at any time."
        confirmLabel="Disconnect"
        variant="danger"
        isLoading={disconnectMutation.isPending}
        onConfirm={() => disconnectTarget && disconnectMutation.mutate(disconnectTarget.id)}
        onCancel={() => setDisconnectTarget(null)}
      />
    </PageTransition>
  );
}
