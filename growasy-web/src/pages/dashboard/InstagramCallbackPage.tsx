import { useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Instagram, Loader2 } from 'lucide-react';
import { PageTransition } from '@/components/ui/PageTransition';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { useToast } from '@/components/ui/toast-context';
import { instagramApi } from '@/lib/instagram-api';
import { ApiError } from '@/lib/api-client';

function ErrorState({
  title,
  message,
  showRestart,
}: {
  title: string;
  message: string;
  showRestart?: boolean;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <AlertTriangle className="h-10 w-10 text-amber-500" aria-hidden="true" />
      <p className="mt-3 text-sm font-medium text-slate-800 dark:text-slate-100">{title}</p>
      <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">{message}</p>
      <div className="mt-5">
        {showRestart ? (
          <Link
            to="/instagram/accounts"
            className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            Restart the connection
          </Link>
        ) : (
          <Link
            to="/instagram/accounts"
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Instagram accounts
          </Link>
        )}
      </div>
    </div>
  );
}

export function InstagramCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const exchangeStarted = useRef(false);

  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const igError = searchParams.get('error');
  const igErrorDescription = searchParams.get('error_description');

  const connectMutation = useMutation({
    mutationFn: ({ code: c, state: s }: { code: string; state: string }) =>
      instagramApi.completeOAuthCallback(c, s),
    onSuccess: (account) => {
      queryClient.invalidateQueries({ queryKey: ['instagram', 'accounts'] });
      showToast({
        variant: 'success',
        title: `@${account.username} connected`,
        description: 'Your Instagram account is ready to use.',
      });
      navigate('/instagram/accounts', { replace: true });
    },
  });

  const connectMutate = connectMutation.mutate;
  useEffect(() => {
    // Guard: StrictMode double-mounts effects in dev, and the code/state pair
    // is single-use — the exchange must run exactly once.
    if (exchangeStarted.current || igError || !code || !state) return;
    exchangeStarted.current = true;
    connectMutate({ code, state });
  }, [code, state, igError, connectMutate]);

  const renderBody = () => {
    if (igError) {
      return (
        <ErrorState
          title="Connection was not completed"
          message={
            igErrorDescription ??
            'Instagram reported that the authorization was cancelled or denied. No account was connected.'
          }
        />
      );
    }

    if (!code || !state) {
      return (
        <ErrorState
          title="Missing authorization details"
          message="This page expects to be opened by Instagram after you approve the connection. Start again from the Instagram accounts page."
          showRestart
        />
      );
    }

    if (connectMutation.isError) {
      const error = connectMutation.error;
      if (error instanceof ApiError && error.status === 401) {
        return (
          <ErrorState
            title="This connection attempt has expired"
            message="The authorization is only valid for a few minutes. Restart the connection to try again."
            showRestart
          />
        );
      }
      if (error instanceof ApiError && error.status === 409) {
        return <ErrorState title="Account already connected" message={error.message} showRestart />;
      }
      if (error instanceof ApiError && error.status === 403) {
        return <ErrorState title="Plan limit reached" message={error.message} showRestart />;
      }
      if (error instanceof ApiError && error.status === 502) {
        return (
          <ErrorState
            title="Instagram could not be reached"
            message={`Instagram returned an error while completing the connection: ${error.message}`}
            showRestart
          />
        );
      }
      return (
        <ErrorState
          title="Could not complete the connection"
          message={error instanceof ApiError ? error.message : 'An unexpected error occurred.'}
          showRestart
        />
      );
    }

    // Pending / idle — the exchange chains a few Instagram calls, takes a moment.
    return (
      <div className="flex flex-col items-center px-6 py-12 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" aria-hidden="true" />
        <p className="mt-4 text-sm font-medium text-slate-800 dark:text-slate-100">
          Connecting your Instagram account&hellip;
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Verifying your authorization with Instagram and saving your account. This can take a few
          seconds.
        </p>
      </div>
    );
  };

  return (
    <PageTransition>
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
            <Instagram className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Connecting Instagram
            </h1>
            <p className="mt-0.5 text-slate-500 dark:text-slate-400">
              Finishing the connection to your workspace.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Instagram account</CardTitle>
            <CardDescription>
              We&rsquo;re securely linking the Instagram Business account you just authorized.
            </CardDescription>
          </CardHeader>
          <CardContent>{renderBody()}</CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
