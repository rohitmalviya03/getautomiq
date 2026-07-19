import { apiClient } from '@/lib/api-client';
import type {
  CreateLinkPayload,
  TrackedLink,
  TrackedLinkStats,
  UpdateLinkPayload,
} from '@/types/api';

function toQuery(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const linksApi = {
  list: (instagramAccountId?: string) =>
    apiClient.get<TrackedLink[]>(`/links${toQuery({ instagramAccountId })}`),

  create: (payload: CreateLinkPayload) => apiClient.post<TrackedLink>('/links', payload),

  update: (id: string, payload: UpdateLinkPayload) =>
    apiClient.patch<TrackedLink>(`/links/${id}`, payload),

  remove: (id: string) => apiClient.delete<void>(`/links/${id}`),

  stats: (id: string, days?: number) =>
    apiClient.get<TrackedLinkStats>(`/links/${id}/stats${toQuery({ days })}`),
};
