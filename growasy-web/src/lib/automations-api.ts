import { apiClient } from '@/lib/api-client';
import type { AutomationRule, AutomationRulePayload } from '@/types/api';

/** A single row in the automation activity feed. */
export interface ActivityEvent {
  id: string;
  outcome: string | null;
  dmSent: boolean;
  matched: boolean;
  source: 'comment' | 'message';
  ruleName: string | null;
  contactUsername: string | null;
  createdAt: string;
}

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

  /** Recent automation activity feed for the org. */
  activity: (limit = 20) =>
    apiClient.get<ActivityEvent[]>(`/automations/rules/activity?limit=${limit}`),
};
