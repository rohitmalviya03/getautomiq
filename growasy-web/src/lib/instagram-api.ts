import { apiClient } from '@/lib/api-client';
import type { InstagramAccount, InstagramMedia, OAuthUrlResponse } from '@/types/api';

export const instagramApi = {
  /**
   * Step 1: get the Instagram authorization URL (signed state already embedded).
   * Pass `reconnectAccountId` to re-authorize an existing account — the callback
   * enforces that the same Instagram identity comes back and reuses its row.
   */
  getOAuthUrl: (reconnectAccountId?: string) =>
    apiClient.get<OAuthUrlResponse>(
      reconnectAccountId
        ? `/instagram/oauth/url?accountId=${encodeURIComponent(reconnectAccountId)}`
        : '/instagram/oauth/url',
    ),

  /**
   * Step 2 (final): exchange Instagram's redirect code for the connected account.
   * With Instagram Login there is exactly one account per login — no page
   * selection step — so this returns the connected account directly.
   */
  completeOAuthCallback: (code: string, state: string) =>
    apiClient.post<InstagramAccount>('/instagram/oauth/callback', { code, state }),

  listAccounts: () => apiClient.get<InstagramAccount[]>('/instagram/accounts'),

  disconnectAccount: (id: string) =>
    apiClient.delete<{ disconnected: true }>(`/instagram/accounts/${id}`),

  syncAccount: (id: string) => apiClient.post<InstagramAccount>(`/instagram/accounts/${id}/sync`),

  /** Recent posts + reels for the automation media picker. */
  listMedia: (id: string) => apiClient.get<InstagramMedia[]>(`/instagram/accounts/${id}/media`),
};
