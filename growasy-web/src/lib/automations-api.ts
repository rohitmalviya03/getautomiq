import { apiClient } from '@/lib/api-client';
import type { AutomationRule, AutomationRulePayload } from '@/types/api';

export const automationsApi = {
  /** List rules, optionally scoped to one Instagram account. */
  list: (instagramAccountId?: string) =>
    apiClient.get<AutomationRule[]>(
      instagramAccountId
        ? `/automations/rules?instagramAccountId=${encodeURIComponent(instagramAccountId)}`
        : '/automations/rules',
    ),

  create: (payload: AutomationRulePayload) =>
    apiClient.post<AutomationRule>('/automations/rules', payload),

  update: (id: string, payload: Partial<AutomationRulePayload>) =>
    apiClient.patch<AutomationRule>(`/automations/rules/${id}`, payload),

  remove: (id: string) => apiClient.delete<{ deleted: true }>(`/automations/rules/${id}`),
};
