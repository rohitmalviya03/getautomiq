import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle } from 'lucide-react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Input, Label, FieldError } from '@/components/ui/Input';
import { useToast } from '@/components/ui/toast-context';
import { authApi } from '@/lib/auth-api';
import { ApiError } from '@/lib/api-client';
import { resetPasswordSchema, type ResetPasswordFormValues } from '@/schemas/auth.schemas';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  if (!token) {
    return (
      <AuthLayout title="Invalid link">
        <div className="flex flex-col items-center text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500" aria-hidden="true" />
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
            This password reset link is missing its token. Request a new one below.
          </p>
          <Link
            to="/forgot-password"
            className="focus-ring mt-6 rounded text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
          >
            Request a new link
          </Link>
        </div>
      </AuthLayout>
    );
  }

  const onSubmit = async (values: ResetPasswordFormValues) => {
    setIsSubmitting(true);
    try {
      await authApi.resetPassword(token, values.newPassword);
      showToast({
        variant: 'success',
        title: 'Password reset',
        description: 'Please log in with your new password.',
      });
      navigate('/login', { replace: true });
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : 'This link may have expired. Please request a new one.';
      showToast({ variant: 'error', title: 'Reset failed', description: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Set a new password">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <Label htmlFor="newPassword">New password</Label>
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            error={errors.newPassword?.message}
            {...register('newPassword')}
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            At least 8 characters, with at least one letter and one number.
          </p>
          <FieldError message={errors.newPassword?.message} />
        </div>

        <div>
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
          <FieldError message={errors.confirmPassword?.message} />
        </div>

        <Button type="submit" className="w-full" isLoading={isSubmitting}>
          Reset password
        </Button>
      </form>
    </AuthLayout>
  );
}
