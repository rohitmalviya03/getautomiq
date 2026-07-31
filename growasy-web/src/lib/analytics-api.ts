import { apiClient } from '@/lib/api-client';
import type { AnalyticsOverview } from '@/types/api';

/** Per-post / per-reel automation performance (Starter+). */
export interface PostAnalytics {
  mediaId: string;
  instagramAccountId: string;
  commentsProcessed: number;
  matched: number;
  dmsSent: number;
  matchRate: number;
  dmDeliveryRate: number;
  ruleNames: string[];
  lastActivityAt: string;
}

export interface PostAnalyticsResponse {
  rangeDays: number;
  posts: PostAnalytics[];
}

export const analyticsApi = {
  overview: (days = 30) => apiClient.get<AnalyticsOverview>(`/analytics/overview?days=${days}`),
  posts: (days = 30) => apiClient.get<PostAnalyticsResponse>(`/analytics/posts?days=${days}`),
};
