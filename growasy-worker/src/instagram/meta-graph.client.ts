import { logger } from '../logger/logger';

const REQUEST_TIMEOUT_MS = 15_000;

/** Meta OAuth error code for an invalid/expired/revoked access token. */
const AUTH_ERROR_CODE = 190;

/**
 * Meta's throttling codes.
 *   4     application-level rate limit
 *   17    user-level rate limit
 *   32    page-level rate limit
 *   613   calls-per-second limit
 *   80007 messaging rate limit (Instagram)
 * Retrying these immediately just deepens the throttle, so callers back off.
 */
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80007]);

/** Used when Meta throttles without telling us for how long. */
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 60_000;
const MAX_RATE_LIMIT_BACKOFF_MS = 15 * 60_000;

interface GraphErrorBody {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
}

/**
 * Raised when the Instagram Graph API returns an error.
 *
 * `isAuthError` singles out the dead-token case (code 190) so the caller can flip
 * the account to NEEDS_RECONNECT and stop retrying instead of hammering a token
 * that will never work again. `isRateLimited` marks the throttling codes, where
 * the right move is the opposite: keep the job, wait, and try again later.
 */
export class InstagramApiError extends Error {
  constructor(
    message: string,
    readonly graphCode?: number,
    readonly httpStatus?: number,
    /** From the Retry-After header, when Meta sends one. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'InstagramApiError';
  }

  get isAuthError(): boolean {
    return this.graphCode === AUTH_ERROR_CODE || this.httpStatus === 401;
  }

  get isRateLimited(): boolean {
    return this.httpStatus === 429 || (this.graphCode !== undefined && RATE_LIMIT_CODES.has(this.graphCode));
  }

  /** How long to hold off for — Meta's hint when given, else a sane default. */
  get backoffMs(): number {
    return Math.min(this.retryAfterMs ?? DEFAULT_RATE_LIMIT_BACKOFF_MS, MAX_RATE_LIMIT_BACKOFF_MS);
  }
}

/** `Retry-After` is seconds or an HTTP date; both are worth honouring. */
function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

export interface MetaGraphClientOptions {
  graphBase: string;
  apiVersion: string;
}

/**
 * Thin Instagram Graph API client for the automation-execution stage. Only the
 * two calls the engine needs: send a DM off a comment, and post a public reply.
 */
export class MetaGraphClient {
  private readonly versioned: string;

  constructor(options: MetaGraphClientOptions) {
    this.versioned = `${options.graphBase.replace(/\/$/, '')}/${options.apiVersion}`;
  }

  /**
   * Sends a DM using a comment as the entry point (Instagram forbids cold DMs).
   * POST graph.instagram.com/v<version>/me/messages
   * body: { recipient: { comment_id }, message: { text } }, Bearer auth.
   */
  async sendDmToComment(
    commentId: string,
    text: string,
    accessToken: string,
  ): Promise<{ messageId: string | null }> {
    const body = await this.request<{ message_id?: string; recipient_id?: string }>(
      `${this.versioned}/me/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { comment_id: commentId },
          message: { text },
        }),
      },
    );
    return { messageId: body.message_id ?? null };
  }

  /**
   * Sends a DM directly to a user who already messaged the business (DM / story
   * reply) — allowed inside the standard messaging window.
   * POST graph.instagram.com/v<version>/me/messages, recipient: { id }.
   */
  async sendDm(
    recipientId: string,
    text: string,
    accessToken: string,
  ): Promise<{ messageId: string | null }> {
    const body = await this.request<{ message_id?: string; recipient_id?: string }>(
      `${this.versioned}/me/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text },
        }),
      },
    );
    return { messageId: body.message_id ?? null };
  }

  /**
   * Posts a public reply under a comment. Instagram's comments `/replies`
   * endpoint takes `message` as a form-urlencoded param (NOT JSON) — fetch sets
   * the content-type automatically from the URLSearchParams body.
   * POST graph.instagram.com/v<version>/<commentId>/replies
   */
  async replyToComment(commentId: string, text: string, accessToken: string): Promise<void> {
    await this.request<{ id?: string }>(`${this.versioned}/${commentId}/replies`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: new URLSearchParams({ message: text }),
    });
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const isTimeout = (error as Error).name === 'TimeoutError';
      // Network/timeout errors are transient — surface as a non-auth error so
      // BullMQ retries with backoff.
      throw new InstagramApiError(
        isTimeout ? 'Instagram API timed out' : 'Could not reach the Instagram API',
      );
    }

    const parsed = (await response.json().catch(() => ({}))) as T & GraphErrorBody;

    if (!response.ok || parsed.error) {
      const code = parsed.error?.code;
      const message = parsed.error?.message ?? `Instagram API error (HTTP ${response.status})`;
      const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
      const error = new InstagramApiError(message, code, response.status, retryAfterMs);
      logger.warn(
        {
          httpStatus: response.status,
          graphCode: code,
          message,
          rateLimited: error.isRateLimited,
          retryAfterMs,
          // Meta reports remaining quota here; invaluable when diagnosing a throttle.
          appUsage: response.headers.get('x-app-usage') ?? undefined,
          businessUsage: response.headers.get('x-business-use-case-usage') ?? undefined,
        },
        'instagram graph api error',
      );
      throw error;
    }

    return parsed;
  }
}
