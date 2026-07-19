import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, ShieldAlert } from 'lucide-react';
import { PageTransition } from '@/components/ui/PageTransition';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Label, FieldError } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/toast-context';
import { usersApi, authApi } from '@/lib/auth-api';
import { ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { profileSchema, type ProfileFormValues } from '@/schemas/auth.schemas';

export function ProfilePage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const setUserProfile = useAuthStore((s) => s.setUserProfile);

  const {
    data: profile,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['users', 'me'],
    queryFn: usersApi.me,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { firstName: '', lastName: '', avatarUrl: '' },
  });

  useEffect(() => {
    if (profile) {
      reset({
        firstName: profile.firstName,
        lastName: profile.lastName,
        avatarUrl: profile.avatarUrl ?? '',
      });
    }
  }, [profile, reset]);

  const updateMutation = useMutation({
    mutationFn: (values: ProfileFormValues) =>
      usersApi.updateMe({
        firstName: values.firstName,
        lastName: values.lastName,
        avatarUrl: values.avatarUrl ? values.avatarUrl : undefined,
      }),
    onSuccess: (updated) => {
      showToast({ variant: 'success', title: 'Profile updated' });
      queryClient.setQueryData(['users', 'me'], (previous: typeof profile) =>
        previous ? { ...previous, ...updated } : previous,
      );
      // Keep the auth store (used for the sidebar/topbar greeting) in sync too.
      if (profile) {
        setUserProfile({ ...profile, ...updated });
      }
    },
    onError: (error) => {
      const message = error instanceof ApiError ? error.message : 'Could not update your profile.';
      showToast({ variant: 'error', title: 'Update failed', description: message });
    },
  });

  const resendMutation = useMutation({
    mutationFn: authApi.resendVerification,
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Verification email sent',
        description: 'Check your inbox for a new link.',
      });
    },
    onError: (error) => {
      const message =
        error instanceof ApiError ? error.message : 'Could not resend the verification email.';
      showToast({ variant: 'error', title: 'Resend failed', description: message });
    },
  });

  return (
    <PageTransition>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Profile &amp; settings
          </h1>
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            Manage your personal information and account status.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Your email address and verification status.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : isError ? (
              <p className="text-sm text-red-600 dark:text-red-400">
                Could not load your account details.
              </p>
            ) : (
              profile && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      {profile.email}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm">
                      {profile.isEmailVerified ? (
                        <>
                          <BadgeCheck className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                          <span className="text-emerald-600 dark:text-emerald-400">
                            Email verified
                          </span>
                        </>
                      ) : (
                        <>
                          <ShieldAlert className="h-4 w-4 text-amber-500" aria-hidden="true" />
                          <span className="text-amber-600 dark:text-amber-400">Not verified</span>
                        </>
                      )}
                    </p>
                  </div>
                  {!profile.isEmailVerified ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      isLoading={resendMutation.isPending}
                      onClick={() => resendMutation.mutate()}
                    >
                      Resend verification email
                    </Button>
                  ) : null}
                </div>
              )
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Personal information</CardTitle>
            <CardDescription>Update your name and avatar.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <form
                onSubmit={handleSubmit((values) => updateMutation.mutate(values))}
                noValidate
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="firstName">First name</Label>
                    <Input
                      id="firstName"
                      error={errors.firstName?.message}
                      {...register('firstName')}
                    />
                    <FieldError message={errors.firstName?.message} />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Last name</Label>
                    <Input
                      id="lastName"
                      error={errors.lastName?.message}
                      {...register('lastName')}
                    />
                    <FieldError message={errors.lastName?.message} />
                  </div>
                </div>

                <div>
                  <Label htmlFor="avatarUrl">Avatar URL</Label>
                  <Input
                    id="avatarUrl"
                    placeholder="https://example.com/avatar.png"
                    error={errors.avatarUrl?.message}
                    {...register('avatarUrl')}
                  />
                  <FieldError message={errors.avatarUrl?.message} />
                </div>

                <Button type="submit" isLoading={updateMutation.isPending} disabled={!isDirty}>
                  Save changes
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
