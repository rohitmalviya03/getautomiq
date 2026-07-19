import { apiClient } from '@/lib/api-client';

/**
 * GET /organizations/:id returns the raw Prisma Organization row. Only the
 * fields growasy-web actually renders are typed here — the rest of the row
 * (billing/plan associations, etc.) isn't part of this module's scope yet.
 */
export interface OrganizationDetail {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

/** GET /organizations/me/usage — current plan + usage vs limits (-1 = unlimited). */
export interface OrgUsage {
  planName: string;
  tier: string | null;
  accountsUsed: number;
  accountsLimit: number;
  activeRulesUsed: number;
  activeRulesLimit: number;
  teamMembersUsed: number;
  teamMembersLimit: number;
  dmsUsedThisMonth: number;
  dmsLimit: number;
  billingCycleAnchor: string | null;
  period: string;
}

/** A role within an organization (Owner / Admin / Editor / Viewer). */
export interface OrgRole {
  id: string;
  name: string;
  slug: string;
}

/** A member of the active organization. */
export interface OrgMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: OrgRole;
  status: string;
  isOwner: boolean;
  joinedAt: string | null;
  createdAt: string;
}

export const organizationsApi = {
  getById: (id: string) => apiClient.get<OrganizationDetail>(`/organizations/${id}`),
  getUsage: () => apiClient.get<OrgUsage>('/organizations/me/usage'),

  createWorkspace: (name?: string) =>
    apiClient.post<OrganizationDetail>('/organizations', name ? { name } : {}),

  listMembers: () => apiClient.get<OrgMember[]>('/organizations/members'),
  listRoles: () => apiClient.get<OrgRole[]>('/organizations/roles'),
  invite: (email: string, roleSlug: string) =>
    apiClient.post<OrgMember>('/organizations/members', { email, roleSlug }),
  updateMemberRole: (id: string, roleSlug: string) =>
    apiClient.patch<OrgMember>(`/organizations/members/${id}`, { roleSlug }),
  removeMember: (id: string) =>
    apiClient.delete<{ removed: true }>(`/organizations/members/${id}`),
};
