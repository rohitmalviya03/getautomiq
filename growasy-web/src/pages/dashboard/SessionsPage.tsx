import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, MonitorSmartphone, ShieldOff, Smartphone } from 'lucide-react';
import { PageTransition } from '@/components/ui/PageTransition';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/toast-context';
import { authApi } from '@/lib/auth-api';
import { ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import type { SessionView } from '@/types/api';

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  if (/mobile/i.test(userAgent)) return 'Mobile device';
  if (/mac os/i.test(userAgent)) return 'Mac';
  if (/windows/i.test(userAgent)) return 'Windows';
  if (/linux/i.test(userAgent)) return 'Linux';
  return 'Desktop';
}

export function SessionsPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const clear = useAuthStore((s) => s.clear);

  const {
    data: sessions,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: authApi.sessions,
  });

  const revokeMutation = useMutation({
    mutationFn: (sessionId: string) => authApi.revokeSession(sessionId),
    onSuccess: (_result, sessionId) => {
      showToast({ variant: 'success', title: 'Session revoked' });
      queryClient.setQueryData<SessionView[]>(['auth', 'sessions'], (current) =>
        current?.filter((s) => s.id !== sessionId),
      );
    },
    onError: (error) => {
      const message = error instanceof ApiError ? error.message : 'Could not revoke that session.';
      showToast({ variant: 'error', title: 'Revoke failed', description: message });
    },
  });

  const logoutAllMutation = useMutation({
    mutationFn: authApi.logoutAll,
    onSuccess: () => {
      clear();
      showToast({ variant: 'info', title: 'Signed out of all devices' });
      navigate('/login', { replace: true });
    },
    onError: (error) => {
      const message =
        error instanceof ApiError ? error.message : 'Could not sign out of all devices.';
      showToast({ variant: 'error', title: 'Action failed', description: message });
    },
  });

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Sessions &amp; devices
            </h1>
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              Everywhere you're currently signed in.
            </p>
          </div>
          <Button
            variant="danger"
            size="sm"
            isLoading={logoutAllMutation.isPending}
            onClick={() => logoutAllMutation.mutate()}
          >
            <LogOut className="h-4 w-4" />
            Log out everywhere
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Active sessions</CardTitle>
            <CardDescription>Revoke any device you don't recognize.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : isError ? (
              <p className="text-sm text-red-600 dark:text-red-400">
                Could not load your active sessions.
              </p>
            ) : !sessions || sessions.length === 0 ? (
              <EmptyState icon={MonitorSmartphone} title="No active sessions" />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {sessions.map((session) => (
                  <li key={session.id} className="flex items-center justify-between gap-4 py-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        <Smartphone className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div>
                        <p className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                          {deviceLabel(session.userAgent)}
                          {session.isCurrent ? (
                            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                              This device
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {session.ipAddress ?? 'Unknown IP'} &middot; last active{' '}
                          {formatRelativeTime(session.lastUsedAt)}
                        </p>
                      </div>
                    </div>
                    {!session.isCurrent ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        isLoading={
                          revokeMutation.isPending && revokeMutation.variables === session.id
                        }
                        onClick={() => revokeMutation.mutate(session.id)}
                      >
                        <ShieldOff className="h-4 w-4" />
                        Revoke
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
