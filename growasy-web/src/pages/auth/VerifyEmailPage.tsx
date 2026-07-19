import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/toast-context';
import { authApi } from '@/lib/auth-api';
import { ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';

type VerificationState = 'verifying' | 'success' | 'error' | 'missing-token';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { showToast } = useToast();
  const isAuthenticated = useAuthStore((s) => s.status === 'authenticated');
  const [state, setState] = useState<VerificationState>(token ? 'verifying' : 'missing-token');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;

    authApi
      .verifyEmail(token)
      .then(() => setState('success'))
      .catch((error) => {
        setErrorMessage(
          error instanceof ApiError
            ? error.message
            : 'This verification link is invalid or has expired.',
        );
        setState('error');
      });
  }, [token]);

  const handleResend = async () => {
    setIsResending(true);
    try {
      await authApi.resendVerification();
      showToast({
        variant: 'success',
        title: 'Verification email sent',
        description: 'Check your inbox for a new link.',
      });
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Could not resend the verification email.';
      showToast({ variant: 'error', title: 'Resend failed', description: message });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <AuthLayout title="Email verification">
      <div className="flex flex-col items-center text-center">
        {state === 'verifying' ? (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-brand-600" aria-hidden="true" />
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
              Verifying your email address&hellip;
            </p>
          </>
        ) : null}

        {state === 'success' ? (
          <>
            <CheckCircle2 className="h-10 w-10 text-emerald-500" aria-hidden="true" />
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
              Your email has been verified. You can now sign in.
            </p>
            <Link
              to={isAuthenticated ? '/' : '/login'}
              className="focus-ring mt-6 rounded text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
            >
              {isAuthenticated ? 'Go to dashboard' : 'Sign in'}
            </Link>
          </>
        ) : null}

        {state === 'error' || state === 'missing-token' ? (
          <>
            <XCircle className="h-10 w-10 text-red-500" aria-hidden="true" />
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
              {state === 'missing-token'
                ? 'This verification link is missing its token.'
                : errorMessage}
            </p>
            {isAuthenticated ? (
              <Button className="mt-6" onClick={handleResend} isLoading={isResending}>
                Resend verification email
              </Button>
            ) : (
              <Link
                to="/login"
                className="focus-ring mt-6 rounded text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
              >
                Back to sign in
              </Link>
            )}
          </>
        ) : null}
      </div>
    </AuthLayout>
  );
}
