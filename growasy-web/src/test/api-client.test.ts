import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiClient, setUnauthorizedHandler } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

function envelope(data: unknown) {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };
}

function errorEnvelope(code: string, message: string) {
  return {
    success: false,
    error: { code, message },
    timestamp: new Date().toISOString(),
    path: '/api/v1/whatever',
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiClient', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      organizations: [],
      activeOrganizationId: null,
      accessToken: null,
      status: 'unknown',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setUnauthorizedHandler(null);
  });

  it('unwraps a successful envelope and returns just `data`', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(envelope({ hello: 'world' })));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiClient.get<{ hello: string }>('/ping');

    expect(result).toEqual({ hello: 'world' });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/ping`,
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it('throws an ApiError with the envelope code/message on a failure envelope', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(errorEnvelope('VALIDATION_ERROR', 'Bad input'), 400));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.post('/auth/register', {})).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Bad input',
    });
  });

  it('attaches Authorization and x-organization-id headers from the auth store', async () => {
    useAuthStore.setState({ accessToken: 'token-123', activeOrganizationId: 'org-1' });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(envelope({ ok: true })));
    vi.stubGlobal('fetch', fetchMock);

    await apiClient.get('/users/me');

    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer token-123');
    expect(headers.get('x-organization-id')).toBe('org-1');
  });

  it('on a 401, refreshes the access token once and retries the original request', async () => {
    useAuthStore.setState({ accessToken: 'stale-token' });

    const fetchMock = vi.fn();
    // 1) original request -> 401
    fetchMock.mockResolvedValueOnce(jsonResponse(errorEnvelope('UNAUTHORIZED', 'Expired'), 401));
    // 2) POST /auth/refresh -> success with a new access token
    fetchMock.mockResolvedValueOnce(
      jsonResponse(envelope({ tokens: { accessToken: 'fresh-token', expiresIn: '15m' } })),
    );
    // 3) retried original request -> success
    fetchMock.mockResolvedValueOnce(jsonResponse(envelope({ id: 'abc' })));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiClient.get<{ id: string }>('/users/me');

    expect(result).toEqual({ id: 'abc' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe(`${BASE_URL}/auth/refresh`);
    expect(fetchMock.mock.calls[2][0]).toBe(`${BASE_URL}/users/me`);

    // The retried request must carry the newly refreshed token, not the stale one.
    const retryHeaders = fetchMock.mock.calls[2][1].headers as Headers;
    expect(retryHeaders.get('Authorization')).toBe('Bearer fresh-token');

    // Store state should reflect the refreshed token.
    expect(useAuthStore.getState().accessToken).toBe('fresh-token');
  });

  it('clears auth state and invokes the unauthorized handler when refresh also fails', async () => {
    useAuthStore.setState({
      accessToken: 'stale-token',
      status: 'authenticated',
      user: {
        id: 'u1',
        email: 'jane@acme.com',
        firstName: 'Jane',
        lastName: 'Doe',
        isEmailVerified: true,
        status: 'ACTIVE',
        organizationId: 'org-1',
      },
    });

    const fetchMock = vi.fn();
    // 1) original request -> 401
    fetchMock.mockResolvedValueOnce(jsonResponse(errorEnvelope('UNAUTHORIZED', 'Expired'), 401));
    // 2) POST /auth/refresh -> also fails (refresh cookie invalid/expired)
    fetchMock.mockResolvedValueOnce(
      jsonResponse(errorEnvelope('UNAUTHORIZED', 'Session expired'), 401),
    );
    vi.stubGlobal('fetch', fetchMock);

    const unauthorizedHandler = vi.fn();
    setUnauthorizedHandler(unauthorizedHandler);

    await expect(apiClient.get('/users/me')).rejects.toBeInstanceOf(ApiError);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(unauthorizedHandler).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
  });

  it('does not attempt a refresh for public auth endpoints like /auth/login', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(errorEnvelope('INVALID_CREDENTIALS', 'Bad login'), 401));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      apiClient.post('/auth/login', { email: 'jane@acme.com', password: 'wrong' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

    // Only the login call itself — no refresh attempt.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
