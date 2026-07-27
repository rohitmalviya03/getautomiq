import { apiClient } from '@/lib/api-client';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  isRead: boolean;
  createdAt: string;
}

export const notificationsApi = {
  list: () => apiClient.get<AppNotification[]>('/notifications'),
  unreadCount: () => apiClient.get<{ count: number }>('/notifications/unread-count'),
  markRead: (id: string) => apiClient.patch<{ ok: true }>(`/notifications/${id}/read`),
  markAllRead: () => apiClient.post<{ updated: number }>('/notifications/read-all'),
};
