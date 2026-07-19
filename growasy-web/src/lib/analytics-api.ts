import { apiClient } from '@/lib/api-client';
import type { AnalyticsOverview } from '@/types/api';

export const analyticsApi = {
  overview: (days = 30) => apiClient.get<AnalyticsOverview>(`/analytics/overview?days=${days}`),
};
