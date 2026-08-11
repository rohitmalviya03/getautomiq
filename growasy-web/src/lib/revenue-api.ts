import { apiClient } from '@/lib/api-client';

/** All money is in minor units (paise for INR), matching the API. */
export interface RevenueReport {
  days: number;
  currency: string;
  totalRevenue: number;
  totalConversions: number;
  attributedRevenue: number;
  attributedConversions: number;
  unattributedRevenue: number;
  byRule: Array<{ ruleId: string; ruleName: string; conversions: number; revenue: number }>;
  byPost: Array<{ mediaId: string; conversions: number; revenue: number }>;
  byVariant: Array<{
    ruleId: string | null;
    ruleName: string | null;
    variantId: string;
    conversions: number;
    revenue: number;
  }>;
}

export interface Conversion {
  id: string;
  source: 'API' | 'MANUAL';
  externalId: string | null;
  value: number;
  currency: string;
  buyerEmail: string | null;
  contactId: string | null;
  ruleId: string | null;
  ruleName: string | null;
  mediaId: string | null;
  variantId: string | null;
  trackedLinkId: string | null;
  matchedBy: string;
  occurredAt: string;
  createdAt: string;
  contact: { id: string; username: string | null; name: string | null; email: string | null } | null;
}

export interface RecordConversionPayload {
  value: number;
  currency?: string;
  externalId?: string;
  email?: string;
  contactId?: string;
  linkSlug?: string;
  occurredAt?: string;
}

export interface ApiKeySummary {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** Only the create call ever carries `key` — it is unrecoverable afterwards. */
export interface IssuedApiKey {
  id: string;
  name: string;
  key: string;
  keyPrefix: string;
  createdAt: string;
}

export const revenueApi = {
  report: (days = 30) => apiClient.get<RevenueReport>(`/revenue/report?days=${days}`),

  conversions: (limit = 25) =>
    apiClient.get<{ items: Conversion[] }>(`/revenue/conversions?limit=${limit}`),

  recordConversion: (payload: RecordConversionPayload) =>
    apiClient.post<Conversion>('/revenue/conversions', payload),

  removeConversion: (id: string) => apiClient.delete<void>(`/revenue/conversions/${id}`),

  apiKeys: () => apiClient.get<{ items: ApiKeySummary[] }>('/revenue/api-keys'),

  createApiKey: (name: string) => apiClient.post<IssuedApiKey>('/revenue/api-keys', { name }),

  revokeApiKey: (id: string) => apiClient.delete<void>(`/revenue/api-keys/${id}`),
};
