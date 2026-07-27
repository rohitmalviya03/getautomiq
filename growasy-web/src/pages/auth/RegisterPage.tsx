import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Sparkles } from 'lucide-react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Input, Label, FieldError } from '@/components/ui/Input';
import { useToast } from '@/components/ui/toast-context';
import { authApi, usersApi } from '@/lib/auth-api';
import { ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { registerSchema, type RegisterFormValues } from '@/schemas/auth.schemas';
import { PLANS, type PlanKey } from '@/lib/plans';

export function RegisterPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const setSession = useAuthStore((s) => s.setSession);
  const setUserProfile = useAuthStore((s) => s.setUserProfile);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Plan carried over from the pricing page (?plan=); defaults to Free.
  const [searchParams] = useSearchParams();
  const requested = PLANS.find((p) => p.key === (searchParams.get('plan') ?? '').toUpperCase());
  // Sales-led plans aren't self-serve — fall back to Free.
  const selectedPlan = requested && !requested.contactSales ? requested : PLANS[0];
  const planKey: PlanKey = selectedPlan.key;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '', firstName: '', lastName: '', organizationName: '' },
  });

  const onSubmit = async (values: RegisterFormValues) => {
    setIsSubmitting(true);
    try {
      const payload = {
        ...values,
        organizationName: values.organizationName?.trim() ? values.organizationName : undefined,
        plan: planKey,
      };
      const result = await authApi.register(payload);
      // /auth/register doesn't return organizations[] (unlike /auth/login) —
      // stash the access token first so the follow-up /users/me call (which
      // has the real org name/slug) is authenticated, then fill in the rest.
      setSession({
        user: result.user,
        organizations: [],
        accessToken: result.tokens.accessToken,
      });
      try {
        const profile = await usersApi.me();
        setUserProfile(profile);
      } catch {
        // Non-fatal: the dashboard will still work with the minimal user view;
        // organizations[] just won't be populated until the next /users/me call.
      }
      showToast({
        variant: 'success',
        title: 'Account created',
        description: 'Check your email to verify your account.',
      });
      navigate('/dashboard', { replace: true });
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
      showToast({ variant: 'error', title: 'Registration failed', description: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Create your account" subtitle="Start automating in minutes">
      <div className="mb-5 flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 dark:border-brand-900 dark:bg-brand-950/40">
        <div className="flex items-center gap-2.5">
          <span className="brand-gradient flex h-8 w-8 items-center justify-center rounded-lg text-white shadow-glow">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {selectedPlan.tag} plan
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {selectedPlan.priceMonthly === '₹0'
                ? 'Free forever'
                : `${selectedPlan.priceMonthly}/mo · start today`}
            </p>
          </div>
        </div>
        <Link
          to="/#pricing"
          className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300"
        >
          Change
        </Link>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="firstName">First name</Label>
            <Input
              id="firstName"
              autoComplete="given-name"
              error={errors.firstName?.message}
              {...register('firstName')}
            />
            <FieldError message={errors.firstName?.message} />
          </div>
          <div>
            <Label htmlFor="lastName">Last name</Label>
            <Input
              id="lastName"
              autoComplete="family-name"
              error={errors.lastName?.message}
              {...register('lastName')}
            />
            <FieldError message={errors.lastName?.message} />
          </div>
        </div>

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

        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register('password')}
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            At least 8 characters, with at least one letter and one number.
          </p>
          <FieldError message={errors.password?.message} />
        </div>

        <div>
          <Label htmlFor="organizationName">Organization name (optional)</Label>
          <Input
            id="organizationName"
            placeholder="Jane's Workspace"
            error={errors.organizationName?.message}
            {...register('organizationName')}
          />
          <FieldError message={errors.organizationName?.message} />
        </div>

        <Button type="submit" className="w-full" isLoading={isSubmitting}>
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
        Already have an account?{' '}
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
