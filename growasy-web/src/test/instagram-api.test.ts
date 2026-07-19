import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { instagramApi } from '@/lib/instagram-api';
import { useAuthStore } from '@/stores/auth-store';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

function envelope(data: unknown) {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('instagramApi', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      organizations: [],
      activeOrganizationId: 'org-1',
      accessToken: 'token-123',
      status: 'authenticated',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getOAuthUrl issues GET /instagram/oauth/url and unwraps { url, state }', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          envelope({ url: 'https://www.instagram.com/oauth/authorize?x=1', state: 'st-1' }),
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await instagramApi.getOAuthUrl();

    expect(result).toEqual({ url: 'https://www.instagram.com/oauth/authorize?x=1', state: 'st-1' });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/instagram/oauth/url`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('completeOAuthCallback POSTs { code, state } and returns the connected account directly', async () => {
    const account = {
      id: 'acc-1',
      instagramBusinessId: 'ig-user-123',
      facebookPageId: null,
      username: 'acmecoffee',
      name: 'Acme Coffee',
      profilePictureUrl: null,
      status: 'CONNECTED',
      connectedByUserId: 'user-1',
      lastSyncedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(envelope(account)));
    vi.stubGlobal('fetch', fetchMock);

    const result = await instagramApi.completeOAuthCallback('code-abc', 'st-1');

    expect(result).toEqual(account);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/instagram/oauth/callback`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ code: 'code-abc', state: 'st-1' });
  });

  it('listAccounts issues GET /instagram/accounts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(envelope([{ id: 'acc-1' }])));
    vi.stubGlobal('fetch', fetchMock);

    const result = await instagramApi.listAccounts();

    expect(result).toEqual([{ id: 'acc-1' }]);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/instagram/accounts`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('disconnectAccount issues DELETE /instagram/accounts/:id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(envelope({ disconnected: true })));
    vi.stubGlobal('fetch', fetchMock);

    await instagramApi.disconnectAccount('acc-1');

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/instagram/accounts/acc-1`,
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('syncAccount issues POST /instagram/accounts/:id/sync', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(envelope({ id: 'acc-1', status: 'CONNECTED' })));
    vi.stubGlobal('fetch', fetchMock);

    const result = await instagramApi.syncAccount('acc-1');

    expect(result).toMatchObject({ id: 'acc-1', status: 'CONNECTED' });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/instagram/accounts/acc-1/sync`,
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
