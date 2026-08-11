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

/** A/B results for one rule. `running: false` when it has a single message. */
export interface VariantStats {
  running: boolean;
  totalSent?: number;
  /** Best performer, or null while the numbers are still too small to call. */
  leader?: string | null;
  variants: Array<{
    id: string;
    text: string;
    sent: number;
    captured: number;
    captureRate: number | null;
  }>;
}

export const automationsApi = {
  variantStats: (ruleId: string) =>
    apiClient.get<VariantStats>(`/automations/rules/${ruleId}/variants`),
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
