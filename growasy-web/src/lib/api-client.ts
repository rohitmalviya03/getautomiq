import { useAuthStore, getAccessToken, getActiveOrganizationId } from '@/stores/auth-store';
import type { ApiEnvelope, RefreshResponse } from '@/types/api';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

/** Public auth endpoints that should never trigger a refresh-and-retry on 401. */
const NO_REFRESH_PATHS = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-email',
]);

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

/** Wired up once at app boot (see App.tsx) so the client can redirect on a hard auth failure. */
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null): void {
  unauthorizedHandler = fn;
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

interface InternalRequestOptions extends RequestOptions {
  skipAuthRetry?: boolean;
}

async function parseEnvelope<T>(response: Response): Promise<T> {
  let envelope: ApiEnvelope<T> | undefined;
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    // Empty or non-JSON body (e.g. a proxy error page) — fall through to the generic error below.
  }

  if (!envelope) {
    throw new ApiError(
      'UNKNOWN_ERROR',
      response.statusText || 'The request failed unexpectedly',
      response.status,
    );
  }

  if (!envelope.success) {
    throw new ApiError(envelope.error.code, envelope.error.message, response.status);
  }

  return envelope.data;
}

function buildHeaders(hasBody: boolean, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  if (hasBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // When the app is served through an ngrok free tunnel, ngrok otherwise injects
  // an HTML browser-warning page in front of API responses, which breaks JSON
  // parsing. This header opts out of that interstitial; it's harmless otherwise.
  headers.set('ngrok-skip-browser-warning', 'true');

  const token = getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Not required by any endpoint yet, but every authenticated call attaches
  // it now so module-scoped endpoints (Instagram accounts, automations, ...)
  // work without a client-side migration once they land.
  const organizationId = getActiveOrganizationId();
  if (organizationId) {
    headers.set('x-organization-id', organizationId);
  }

  return headers;
}

// Backstop so a stalled request (dead backend, hung proxy/tunnel) surfaces as a
// clear error instead of an infinite loading spinner. Generous enough for the
// Instagram connect flow, which chains several upstream Meta calls server-side.
const REQUEST_TIMEOUT_MS = 30_000;

function rawRequest(path: string, options: InternalRequestOptions): Promise<Response> {
  const { body, headers, skipAuthRetry: _skipAuthRetry, ...rest } = options;
  return fetch(`${BASE_URL}${path}`, {
    ...rest,
    credentials: 'include',
    headers: buildHeaders(body !== undefined, headers),
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: rest.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

let refreshInFlight: Promise<string | null> | null = null;

/** Single-flight refresh: concurrent 401s share one /auth/refresh call. */
function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${BASE_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!response.ok) {
          return null;
        }
        const data = await parseEnvelope<RefreshResponse>(response);
        useAuthStore.getState().setAccessToken(data.tokens.accessToken);
        return data.tokens.accessToken;
      } catch {
        return null;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/**
 * Core request function: attaches auth headers, unwraps the `{success,data,error}`
 * envelope, and on a 401 from a protected endpoint attempts exactly one
 * refresh-then-retry before giving up and clearing auth state.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await rawRequest(path, options);

  if (response.status === 401 && !NO_REFRESH_PATHS.has(path)) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      const retryResponse = await rawRequest(path, { ...options, skipAuthRetry: true });
      return parseEnvelope<T>(retryResponse);
    }

    useAuthStore.getState().clear();
    unauthorizedHandler?.();
    // Still resolve the envelope shape of the original failed response so
    // callers get a real ApiError (code/message) instead of a generic one.
    return parseEnvelope<T>(response);
  }

  return parseEnvelope<T>(response);
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
};
