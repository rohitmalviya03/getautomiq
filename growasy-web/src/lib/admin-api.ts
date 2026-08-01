import { apiClient } from '@/lib/api-client';

export interface AdminOverview {
  totals: {
    organizations: number;
    activeOrganizations: number;
    users: number;
    superAdmins: number;
    connectedInstagramAccounts: number;
    newOrganizations30d: number;
  };
  subscriptions: { byStatus: Record<string, number>; mrrMinor: number; currency: string };
  usage: { period: string; dmsSent: number };
  recentSignups: Array<{ id: string; name: string; slug: string; ownerEmail: string; createdAt: string }>;
}

export interface AdminOwner {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface AdminCustomerRow {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  owner: AdminOwner;
  plan: string;
  tier: string;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  members: number;
  instagramAccounts: number;
  automations: number;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface AdminCustomerDetail {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  timezone: string;
  createdAt: string;
  owner: AdminOwner & { status: string; lastLoginAt: string | null };
  members: Array<{
    status: string;
    user: { id: string; email: string; firstName: string; lastName: string; status: string };
    role: { name: string; slug: string };
  }>;
  instagramAccounts: Array<{
    id: string;
    username: string;
    status: string;
    instagramBusinessId: string;
    lastSyncedAt: string | null;
  }>;
  subscription: {
    id: string;
    status: string;
    billingCycle: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    trialEndsAt: string | null;
    cancelAtPeriodEnd: boolean;
    plan: { name: string; tier: string; monthlyPrice: number; yearlyPrice: number; currency: string };
  } | null;
  usageTracking: Array<{ metric: string; period: string; count: number }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    amount: number;
    currency: string;
    status: string;
    issuedAt: string;
    paidAt: string | null;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    method: string | null;
    createdAt: string;
    paidAt: string | null;
  }>;
  recentActivity: Array<{
    id: string;
    commenterId: string;
    outcome: string | null;
    matched: boolean;
    dmSent: boolean;
    createdAt: string;
  }>;
  _count: { automationRules: number; contacts: number };
}

export interface AdminUserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  isSuperAdmin: boolean;
  isEmailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  ownedOrganizations: number;
}

export interface AdminAuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  organizationId: string | null;
  ipAddress: string | null;
  after: string | null;
  createdAt: string;
  actor: { id: string; email: string; firstName: string; lastName: string } | null;
}

export interface ChangePlanInput {
  tier?: string;
  billingCycle?: 'MONTHLY' | 'YEARLY';
  status?: string;
  trialEndsAt?: string;
  cancelAtPeriodEnd?: boolean;
  reason?: string;
}

export interface ImpersonateResponse {
  tokens: { accessToken: string; refreshToken: string; expiresIn: string };
  user: { id: string; email: string; firstName: string; lastName: string };
  organization: { id: string; name: string; slug: string };
}

function listQuery(params: { search?: string; page?: number; pageSize?: number }) {
  const q = new URLSearchParams();
  if (params.search) q.set('search', params.search);
  if (params.page) q.set('page', String(params.page));
  if (params.pageSize) q.set('pageSize', String(params.pageSize));
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const adminApi = {
  overview: () => apiClient.get<AdminOverview>('/admin/overview'),

  customers: (params: { search?: string; page?: number; pageSize?: number } = {}) =>
    apiClient.get<Paginated<AdminCustomerRow>>(`/admin/customers${listQuery(params)}`),
  customer: (id: string) => apiClient.get<AdminCustomerDetail>(`/admin/customers/${id}`),
  changePlan: (id: string, body: ChangePlanInput) =>
    apiClient.patch<AdminCustomerDetail['subscription']>(`/admin/customers/${id}/plan`, body),
  suspendCustomer: (id: string, reason?: string) =>
    apiClient.post(`/admin/customers/${id}/suspend`, { reason }),
  reactivateCustomer: (id: string, reason?: string) =>
    apiClient.post(`/admin/customers/${id}/reactivate`, { reason }),
  impersonate: (id: string) => apiClient.post<ImpersonateResponse>(`/admin/customers/${id}/impersonate`),

  // Extra admin powers
  adjustUsage: (id: string, body: { action: 'reset' | 'grant'; amount?: number; reason?: string }) =>
    apiClient.patch(`/admin/customers/${id}/usage`, body),
  comp: (id: string, body: { tier: string; days: number; reason?: string }) =>
    apiClient.post(`/admin/customers/${id}/comp`, body),
  notifyCustomer: (id: string, body: { title: string; body?: string }) =>
    apiClient.post(`/admin/customers/${id}/notify`, body),
  disconnectAccount: (id: string, accountId: string) =>
    apiClient.post(`/admin/customers/${id}/accounts/${accountId}/disconnect`),
  verifyEmail: (userId: string) => apiClient.post(`/admin/users/${userId}/verify-email`),

  users: (params: { search?: string; page?: number; pageSize?: number } = {}) =>
    apiClient.get<Paginated<AdminUserRow>>(`/admin/users${listQuery(params)}`),
  setSuperAdmin: (id: string, isSuperAdmin: boolean, reason?: string) =>
    apiClient.patch<AdminUserRow>(`/admin/users/${id}/super-admin`, { isSuperAdmin, reason }),
  suspendUser: (id: string, reason?: string) => apiClient.post(`/admin/users/${id}/suspend`, { reason }),
  reactivateUser: (id: string, reason?: string) => apiClient.post(`/admin/users/${id}/reactivate`, { reason }),

  auditLog: (params: { page?: number; pageSize?: number } = {}) =>
    apiClient.get<Paginated<AdminAuditRow>>(`/admin/audit-log${listQuery(params)}`),
};
