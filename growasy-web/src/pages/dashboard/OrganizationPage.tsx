import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Check, Crown, Plus, Trash2, UserPlus } from 'lucide-react';
import { PageTransition } from '@/components/ui/PageTransition';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/toast-context';
import { useAuthStore } from '@/stores/auth-store';
import { organizationsApi, type OrgMember } from '@/lib/organizations-api';
import { planRank, PLAN_RANK } from '@/lib/plans';
import { usersApi } from '@/lib/auth-api';
import { ApiError } from '@/lib/api-client';
import { Link } from 'react-router-dom';

const ROLE_BADGE: Record<string, string> = {
  owner: 'bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300',
  admin: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  editor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  viewer: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

export function OrganizationPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const organizations = useAuthStore((s) => s.organizations);
  const activeOrganizationId = useAuthStore((s) => s.activeOrganizationId);
  const setActiveOrganizationId = useAuthStore((s) => s.setActiveOrganizationId);
  const setUserProfile = useAuthStore((s) => s.setUserProfile);

  const activeOrg = organizations.find((o) => o.id === activeOrganizationId);
  const myRole = activeOrg?.role;
  const canManage = myRole === 'owner' || myRole === 'admin';

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('editor');
  const [newWorkspace, setNewWorkspace] = useState('');
  const [removeTarget, setRemoveTarget] = useState<OrgMember | null>(null);

  const detailQuery = useQuery({
    queryKey: ['organizations', activeOrganizationId],
    queryFn: () => organizationsApi.getById(activeOrganizationId as string),
    enabled: Boolean(activeOrganizationId),
  });
  const membersQuery = useQuery({
    queryKey: ['organizations', 'members', activeOrganizationId],
    queryFn: organizationsApi.listMembers,
    enabled: Boolean(activeOrganizationId),
  });
  const rolesQuery = useQuery({
    queryKey: ['organizations', 'roles', activeOrganizationId],
    queryFn: organizationsApi.listRoles,
    enabled: Boolean(activeOrganizationId) && canManage,
  });
  const usageQuery = useQuery({
    queryKey: ['organizations', 'usage', activeOrganizationId],
    queryFn: organizationsApi.getUsage,
    enabled: Boolean(activeOrganizationId),
  });

  // Plan gating: team-seat cap + multiple-workspaces feature (Growth+).
  const usage = usageQuery.data;
  const seatsUsed = usage?.teamMembersUsed ?? 0;
  const seatsLimit = usage?.teamMembersLimit ?? -1;
  const seatsUnlimited = seatsLimit < 0;
  const atSeatCap = !seatsUnlimited && seatsUsed >= seatsLimit;
  const canMultiWorkspace = usage ? planRank(usage.planName) >= PLAN_RANK.GROWTH : true;

  const invalidateMembers = () => {
    queryClient.invalidateQueries({ queryKey: ['organizations', 'members', activeOrganizationId] });
    queryClient.invalidateQueries({ queryKey: ['organizations', 'usage', activeOrganizationId] });
  };

  const err = (fallback: string) => (e: unknown) =>
    showToast({
      variant: 'error',
      title: fallback,
      description: e instanceof ApiError ? e.message : 'Something went wrong.',
    });

  const inviteMutation = useMutation({
    mutationFn: () => organizationsApi.invite(inviteEmail.trim(), inviteRole),
    onSuccess: (m) => {
      showToast({ variant: 'success', title: `${m.name} added to the workspace` });
      setInviteEmail('');
      invalidateMembers();
    },
    onError: err('Could not invite member'),
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, roleSlug }: { id: string; roleSlug: string }) =>
      organizationsApi.updateMemberRole(id, roleSlug),
    onSuccess: () => {
      showToast({ variant: 'success', title: 'Role updated' });
      invalidateMembers();
    },
    onError: err('Could not update role'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => organizationsApi.removeMember(id),
    onSuccess: () => {
      showToast({ variant: 'success', title: 'Member removed' });
      setRemoveTarget(null);
      invalidateMembers();
    },
    onError: err('Could not remove member'),
  });

  const createWorkspaceMutation = useMutation({
    mutationFn: () => organizationsApi.createWorkspace(newWorkspace.trim() || undefined),
    onSuccess: async (org) => {
      // Refresh the org list in the store so the switcher + this page update.
      try {
        const profile = await usersApi.me();
        setUserProfile(profile);
      } catch {
        /* non-fatal — the new workspace still exists server-side */
      }
      setActiveOrganizationId(org.id);
      setNewWorkspace('');
      showToast({ variant: 'success', title: `Workspace "${org.name}" created` });
    },
    onError: err('Could not create workspace'),
  });

  const members = membersQuery.data ?? [];
  const roles = rolesQuery.data ?? [];

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Organization</h1>
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            Manage your workspace, invite teammates, and control who can do what.
          </p>
        </div>

        {/* Active workspace */}
        <Card>
          <CardHeader>
            <CardTitle>Active workspace</CardTitle>
            <CardDescription>Everything you do is scoped to this organization.</CardDescription>
          </CardHeader>
          <CardContent>
            {detailQuery.isLoading ? (
              <Skeleton className="h-6 w-2/3" />
            ) : detailQuery.data ? (
              <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Name</dt>
                  <dd className="mt-0.5 font-medium text-slate-800 dark:text-slate-100">
                    {detailQuery.data.name}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Your role</dt>
                  <dd className="mt-0.5">
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-semibold capitalize ${ROLE_BADGE[myRole ?? 'viewer'] ?? ROLE_BADGE.viewer}`}
                    >
                      {myRole}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Created</dt>
                  <dd className="mt-0.5 font-medium text-slate-800 dark:text-slate-100">
                    {new Date(detailQuery.data.createdAt).toLocaleDateString()}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">No active organization.</p>
            )}
          </CardContent>
        </Card>

        {/* Team members */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Team members</CardTitle>
              <CardDescription>
                {canManage
                  ? 'Invite people who already have an Automiq account and set their access level.'
                  : 'People with access to this workspace.'}
              </CardDescription>
            </div>
            <span className="shrink-0 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {seatsUsed}
              {seatsUnlimited ? '' : ` / ${seatsLimit}`} seat{seatsLimit === 1 ? '' : 's'}
            </span>
          </CardHeader>
          <CardContent className="space-y-4">
            {canManage && atSeatCap ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  You’ve used all {seatsLimit} seat{seatsLimit === 1 ? '' : 's'} on your{' '}
                  <strong>{usage?.planName}</strong> plan.
                </p>
                <Link to="/billing">
                  <Button size="sm">Upgrade plan</Button>
                </Link>
              </div>
            ) : null}

            {canManage && !atSeatCap ? (
              <form
                className="flex flex-col gap-2 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (inviteEmail.trim()) inviteMutation.mutate();
                }}
              >
                <Input
                  type="email"
                  placeholder="teammate@email.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  aria-label="Invite by email"
                  className="flex-1"
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  aria-label="Role"
                  className="focus-ring rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                >
                  {(roles.length ? roles : [{ slug: 'editor', name: 'Editor' }]).map((r) => (
                    <option key={r.slug} value={r.slug}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <Button type="submit" isLoading={inviteMutation.isPending}>
                  <UserPlus className="h-4 w-4" /> Invite
                </Button>
              </form>
            ) : null}

            {membersQuery.isLoading ? (
              <div className="space-y-2">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {members.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                      {m.name.charAt(0).toUpperCase() || '?'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                        {m.name}
                        {m.isOwner ? (
                          <Crown className="h-3.5 w-3.5 text-amber-500" aria-label="Owner" />
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{m.email}</p>
                    </div>

                    {canManage && !m.isOwner ? (
                      <select
                        value={m.role.slug}
                        onChange={(e) => roleMutation.mutate({ id: m.id, roleSlug: e.target.value })}
                        disabled={roleMutation.isPending}
                        aria-label={`Role for ${m.name}`}
                        className="focus-ring rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      >
                        {roles.map((r) => (
                          <option key={r.slug} value={r.slug}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-semibold capitalize ${ROLE_BADGE[m.role.slug] ?? ROLE_BADGE.viewer}`}
                      >
                        {m.role.name}
                      </span>
                    )}

                    {canManage && !m.isOwner ? (
                      <button
                        type="button"
                        onClick={() => setRemoveTarget(m)}
                        className="focus-ring rounded-md p-1.5 text-slate-400 hover:text-red-600"
                        aria-label={`Remove ${m.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Create workspace */}
        <Card>
          <CardHeader>
            <CardTitle>Create a workspace</CardTitle>
            <CardDescription>
              Spin up a separate workspace — great for managing another brand or client. Starts on
              the Free plan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {canMultiWorkspace ? (
              <form
                className="flex flex-col gap-2 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  createWorkspaceMutation.mutate();
                }}
              >
                <Input
                  placeholder="e.g. Acme Clients"
                  value={newWorkspace}
                  onChange={(e) => setNewWorkspace(e.target.value)}
                  aria-label="New workspace name"
                  className="flex-1"
                />
                <Button
                  type="submit"
                  variant="secondary"
                  isLoading={createWorkspaceMutation.isPending}
                >
                  <Plus className="h-4 w-4" /> Create
                </Button>
              </form>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Multiple workspaces are available on <strong>Growth</strong> and above.
                </p>
                <Link to="/billing">
                  <Button size="sm">Upgrade plan</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* All workspaces */}
        <Card>
          <CardHeader>
            <CardTitle>All workspaces</CardTitle>
            <CardDescription>Switch which organization you're acting as.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {organizations.map((org) => (
                <li key={org.id} className="flex items-center justify-between py-3">
                  <button
                    type="button"
                    onClick={() => setActiveOrganizationId(org.id)}
                    className="focus-ring flex flex-1 items-center gap-3 rounded-lg text-left"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      <Building2 className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">
                        {org.name}
                      </span>
                      <span className="block text-xs capitalize text-slate-400">{org.role}</span>
                    </span>
                  </button>
                  {org.id === activeOrganizationId ? (
                    <Check className="h-4 w-4 text-brand-600" aria-hidden="true" />
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={removeTarget !== null}
        title={`Remove ${removeTarget?.name ?? 'member'}?`}
        description="They'll lose access to this workspace. You can invite them again later."
        confirmLabel="Remove"
        variant="danger"
        isLoading={removeMutation.isPending}
        onConfirm={() => removeTarget && removeMutation.mutate(removeTarget.id)}
        onCancel={() => setRemoveTarget(null)}
      />
    </PageTransition>
  );
}
