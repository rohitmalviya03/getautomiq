import { logger } from '../logger/logger';

const REQUEST_TIMEOUT_MS = 15_000;

/** Meta OAuth error code for an invalid/expired/revoked access token. */
const AUTH_ERROR_CODE = 190;

interface GraphErrorBody {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
}

/**
 * Raised when the Instagram Graph API returns an error. `isAuthError` singles
 * out the dead-token case (code 190) so the caller can flip the account to
 * NEEDS_RECONNECT and stop retrying instead of hammering a token that will
 * never work again.
 */
export class InstagramApiError extends Error {
  constructor(
    message: string,
    readonly graphCode?: number,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'InstagramApiError';
  }

  get isAuthError(): boolean {
    return this.graphCode === AUTH_ERROR_CODE || this.httpStatus === 401;
  }
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
      logger.warn(
        { httpStatus: response.status, graphCode: code, message },
        'instagram graph api error',
      );
      throw new InstagramApiError(message, code, response.status);
    }

    return parsed;
  }
}
