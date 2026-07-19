import { apiClient } from '@/lib/api-client';
import { getAccessToken, getActiveOrganizationId } from '@/stores/auth-store';
import type { Contact } from '@/types/api';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

interface ListParams {
  instagramAccountId?: string;
  search?: string;
  limit?: number;
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const contactsApi = {
  /** First page of contacts (up to `limit`, default 100). */
  list: ({ instagramAccountId, search, limit = 100 }: ListParams = {}) =>
    apiClient.get<Contact[]>(`/contacts${toQuery({ instagramAccountId, search, limit })}`),

  /**
   * Fetches the CSV export as raw text. Can't use apiClient (that unwraps a JSON
   * envelope), so this is a direct authed fetch reusing the same token/org headers.
   */
  exportCsv: async (instagramAccountId?: string): Promise<string> => {
    const res = await fetch(`${BASE_URL}/contacts/export.csv${toQuery({ instagramAccountId })}`, {
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${getAccessToken() ?? ''}`,
        'x-organization-id': getActiveOrganizationId() ?? '',
        'ngrok-skip-browser-warning': 'true',
      },
    });
    if (!res.ok) {
      throw new Error(`Export failed (${res.status})`);
    }
    return res.text();
  },
};
