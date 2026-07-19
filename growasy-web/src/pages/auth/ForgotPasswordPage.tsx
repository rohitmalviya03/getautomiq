import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Input, Label, FieldError } from '@/components/ui/Input';
import { useToast } from '@/components/ui/toast-context';
import { authApi } from '@/lib/auth-api';
import { ApiError } from '@/lib/api-client';
import { forgotPasswordSchema, type ForgotPasswordFormValues } from '@/schemas/auth.schemas';

export function ForgotPasswordPage() {
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: ForgotPasswordFormValues) => {
    setIsSubmitting(true);
    try {
      // The API always returns the same generic message regardless of whether
      // the account exists — that's intentional (don't leak account existence).
      await authApi.forgotPassword(values.email);
      setSubmitted(true);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
      showToast({ variant: 'error', title: 'Request failed', description: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <AuthLayout title="Check your email">
        <div className="flex flex-col items-center text-center">
          <MailCheck className="h-10 w-10 text-brand-600" aria-hidden="true" />
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
            If an account exists for this email, a reset link has been sent.
          </p>
          <Link
            to="/login"
            className="focus-ring mt-6 rounded text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
          >
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a reset link"
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="jane@acme.com"
            error={errors.email?.message}
            {...register('email')}
          />
          <FieldError message={errors.email?.message} />
        </div>

        <Button type="submit" className="w-full" isLoading={isSubmitting}>
          Send reset link
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
        Remembered your password?{' '}
        <Link
          to="/login"
          className="focus-ring rounded font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
        >
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
