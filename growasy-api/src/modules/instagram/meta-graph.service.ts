import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';

// "Instagram API with Instagram Login" hosts. This flow connects an Instagram
// Business/Creator account directly — no Facebook Page, no graph.facebook.com.
const IG_AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize';
const IG_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const IG_GRAPH_BASE = 'https://graph.instagram.com';

export interface ShortLivedToken {
  accessToken: string;
  userId: string;
}

export interface LongLivedToken {
  accessToken: string;
  /** Seconds until expiry (~60 days). */
  expiresIn: number;
}

export interface InstagramProfile {
  /**
   * The Instagram account id that webhooks deliver as `entry.id` (the `user_id`
   * field, e.g. 17841…). This is what we store as `instagramBusinessId` and what
   * the worker matches inbound comment/message events against.
   */
  id: string;
  /**
   * The `/me` `id` field — a *different*, app-scoped number. Kept for reference /
   * debugging only; never used for webhook matching.
   */
  appScopedId: string | null;
  username: string;
  name: string | null;
  profilePictureUrl: string | null;
  followersCount: number | null;
  mediaCount: number | null;
}

export interface InstagramMedia {
  id: string;
  caption: string | null;
  /** IMAGE | VIDEO | CAROUSEL_ALBUM */
  mediaType: string;
  /** FEED | REELS | STORY — lets us label reels vs posts. */
  mediaProductType: string | null;
  /** Best display image: video poster (thumbnail_url) or the image itself. */
  thumbnailUrl: string | null;
  permalink: string | null;
  timestamp: string | null;
}

interface GraphErrorBody {
  error?: { message?: string; type?: string; code?: number };
  error_message?: string; // api.instagram.com uses this shape instead of `error`
}

/** Upper bound per Instagram HTTP call so a stalled request can't hang forever. */
const IG_REQUEST_TIMEOUT_MS = 15_000;

/** Graph error code for an expired/invalid access token. */
const GRAPH_AUTH_ERROR_CODE = 190;

/**
 * A Graph API error surfaced as a 502. Carries the raw Graph error code so
 * callers can distinguish an auth failure (expired token → mark account for
 * reconnect, don't retry) from a transient error (retry-able).
 */
export class InstagramApiError extends BadGatewayException {
  constructor(
    message: string,
    readonly graphCode?: number,
  ) {
    super(`Instagram API error: ${message}`);
  }

  get isAuthError(): boolean {
    return this.graphCode === GRAPH_AUTH_ERROR_CODE;
  }
}

/**
 * Typed client for the "Instagram API with Instagram Login" OAuth flow.
 * Owns only HTTP — token persistence/encryption and business rules live in
 * InstagramAccountsService.
 */
@Injectable()
export class MetaGraphService {
  private readonly logger = new Logger(MetaGraphService.name);

  constructor(private readonly config: AppConfigService) {}

  /** Throws a clear 503 when Instagram app credentials haven't been configured yet. */
  assertConfigured(): void {
    const { instagramAppId, instagramAppSecret, redirectUri } = this.config.meta;
    if (!instagramAppId || !instagramAppSecret || !redirectUri) {
      throw new ServiceUnavailableException(
        'Instagram integration is not configured. Set INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET and META_REDIRECT_URI.',
      );
    }
  }

  /**
   * Step 1: the Instagram authorization URL the user is redirected to.
   *
   * `forceReauth` maps to Instagram's `force_reauth=true`, which forces the login /
   * account-chooser screen instead of silently re-using whichever account the
   * browser is already logged into. Without it a user who already has one account
   * connected can never add a *second* one — Instagram just returns the same
   * account and we re-upsert the existing row. So we set it when connecting a NEW
   * account, and leave it off for reconnects (which must stay on the same account).
   */
  buildAuthorizationUrl(state: string, forceReauth = false): string {
    this.assertConfigured();
    const params = new URLSearchParams({
      // MUST be the Instagram App ID (not the Facebook App ID) or Instagram
      // returns "Invalid platform app".
      client_id: this.config.meta.instagramAppId,
      redirect_uri: this.config.meta.redirectUri,
      response_type: 'code',
      scope: this.config.meta.oauthScopes,
      // Optional per the OAuth spec but supported by Instagram — we use it for CSRF.
      state,
    });
    if (forceReauth) {
      params.set('force_reauth', 'true');
    }
    return `${IG_AUTHORIZE_URL}?${params.toString()}`;
  }

  /**
   * Step 2: exchange the callback code for a short-lived token + the IG user id.
   * POST application/x-www-form-urlencoded to api.instagram.com.
   */
  async exchangeCodeForToken(code: string): Promise<ShortLivedToken> {
    this.assertConfigured();
    const form = new URLSearchParams({
      client_id: this.config.meta.instagramAppId,
      client_secret: this.config.meta.instagramAppSecret,
      grant_type: 'authorization_code',
      redirect_uri: this.config.meta.redirectUri,
      code,
    });
    const body = await this.httpJson<{ access_token: string; user_id: number | string }>(
      IG_TOKEN_URL,
      { method: 'POST', body: form },
    );
    return { accessToken: body.access_token, userId: String(body.user_id) };
  }

  /**
   * Step 3: upgrade the short-lived token to a long-lived one (~60 days).
   * GET graph.instagram.com/access_token?grant_type=ig_exchange_token
   */
  async exchangeForLongLivedToken(shortLivedToken: string): Promise<LongLivedToken> {
    this.assertConfigured();
    const params = new URLSearchParams({
      grant_type: 'ig_exchange_token',
      client_secret: this.config.meta.instagramAppSecret,
      access_token: shortLivedToken,
    });
    const body = await this.httpJson<{ access_token: string; expires_in: number }>(
      `${IG_GRAPH_BASE}/access_token?${params}`,
      { method: 'GET' },
    );
    return { accessToken: body.access_token, expiresIn: body.expires_in };
  }

  /** Step 4: fetch the connected account's profile with the long-lived token. */
  async getProfile(accessToken: string): Promise<InstagramProfile> {
    const params = new URLSearchParams({
      // `user_id` is the IG account id that webhooks send as entry.id; `id` is a
      // *different* app-scoped number. Request both — we key the account on user_id.
      fields: 'id,user_id,username,name,profile_picture_url,followers_count,media_count',
      access_token: accessToken,
    });
    const body = await this.httpJson<{
      id: string;
      user_id?: string | number;
      username: string;
      name?: string;
      profile_picture_url?: string;
      followers_count?: number;
      media_count?: number;
    }>(`${IG_GRAPH_BASE}/me?${params}`, { method: 'GET' });

    // Prefer user_id (matches webhook entry.id). Fall back to id only if the field
    // is unexpectedly absent, so a connect never fails outright.
    const webhookId = body.user_id != null ? String(body.user_id) : body.id;
    return {
      id: webhookId,
      appScopedId: body.id ? String(body.id) : null,
      username: body.username,
      name: body.name ?? null,
      profilePictureUrl: body.profile_picture_url ?? null,
      followersCount: body.followers_count ?? null,
      mediaCount: body.media_count ?? null,
    };
  }

  /**
   * Lists the account's recent media (posts + reels) so the automation builder
   * can offer a visual picker instead of a raw media id. Read-only; returns
   * metadata only (never the token).
   * GET graph.instagram.com/v<version>/<igUserId>/media
   */
  async listMedia(accessToken: string, limit = 25): Promise<InstagramMedia[]> {
    const params = new URLSearchParams({
      fields: 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp',
      limit: String(Math.min(Math.max(limit, 1), 50)),
      access_token: accessToken,
    });
    const body = await this.httpJson<{
      data?: Array<{
        id: string;
        caption?: string;
        media_type?: string;
        media_product_type?: string;
        media_url?: string;
        thumbnail_url?: string;
        permalink?: string;
        timestamp?: string;
      }>;
    }>(`${IG_GRAPH_BASE}/me/media?${params}`, { method: 'GET' });

    return (body.data ?? []).map((m) => ({
      id: m.id,
      caption: m.caption ?? null,
      mediaType: m.media_type ?? 'IMAGE',
      mediaProductType: m.media_product_type ?? null,
      // Videos/reels return a poster in thumbnail_url; images only have media_url.
      thumbnailUrl: m.thumbnail_url ?? m.media_url ?? null,
      permalink: m.permalink ?? null,
      timestamp: m.timestamp ?? null,
    }));
  }

  /**
   * Refreshes a long-lived token before it expires (valid ones ≥24h old can be
   * refreshed for another 60 days). Used by a future scheduled refresh job.
   */
  async refreshLongLivedToken(longLivedToken: string): Promise<LongLivedToken> {
    const params = new URLSearchParams({
      grant_type: 'ig_refresh_token',
      access_token: longLivedToken,
    });
    const body = await this.httpJson<{ access_token: string; expires_in: number }>(
      `${IG_GRAPH_BASE}/refresh_access_token?${params}`,
      { method: 'GET' },
    );
    return { accessToken: body.access_token, expiresIn: body.expires_in };
  }

  // ---------------------------------------------------------------------
  // Messaging (comment → DM automation)
  // ---------------------------------------------------------------------

  /**
   * Sends a DM using a comment as the entry point. Instagram forbids cold DMs;
   * `recipient: { comment_id }` is the sanctioned way to open a conversation
   * from a comment the account received.
   * POST graph.instagram.com/v<version>/<igUserId>/messages
   */
  async sendDmToComment(
    igUserId: string,
    commentId: string,
    text: string,
    accessToken: string,
  ): Promise<{ messageId: string | null }> {
    const body = await this.httpJson<{ message_id?: string; recipient_id?: string }>(
      `${this.graphVersioned()}/${igUserId}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { comment_id: commentId },
          message: { text },
        }),
      },
    );
    return { messageId: body.message_id ?? null };
  }

  /**
   * Posts a public reply under a comment.
   * POST graph.instagram.com/v<version>/<commentId>/replies
   */
  async replyToComment(commentId: string, text: string, accessToken: string): Promise<void> {
    const form = new URLSearchParams({ message: text });
    await this.httpJson<{ id?: string }>(`${this.graphVersioned()}/${commentId}/replies`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
  }

  /**
   * Subscribes this Instagram account to the app's webhooks. This is REQUIRED
   * for Meta to actually deliver comment events for the account — configuring
   * the webhook + subscribing the `comments` field at the app level is not
   * enough; each account must be subscribed via the Graph API too.
   * POST graph.instagram.com/v<version>/<igUserId>/subscribed_apps?subscribed_fields=comments
   */
  async subscribeToWebhooks(igUserId: string, accessToken: string): Promise<void> {
    // `comments` (post/reel comments) + `messages` (DMs + story replies).
    const params = new URLSearchParams({ subscribed_fields: 'comments,messages' });
    await this.httpJson<{ success?: boolean }>(
      `${this.graphVersioned()}/${igUserId}/subscribed_apps?${params.toString()}`,
      { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } },
    );
  }

  /**
   * Reads back what the account is actually subscribed to — diagnostic for when
   * comment webhooks aren't arriving despite a "successful" subscribe call.
   * GET graph.instagram.com/v<version>/<igUserId>/subscribed_apps
   */
  async getSubscribedApps(igUserId: string, accessToken: string): Promise<unknown> {
    return this.httpJson<unknown>(`${this.graphVersioned()}/${igUserId}/subscribed_apps`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  /**
   * Detaches the app from an account's webhooks so Meta stops delivering its
   * comment events. Called when an account is removed from a workspace.
   * DELETE graph.instagram.com/v<version>/<igUserId>/subscribed_apps
   */
  async unsubscribeFromWebhooks(igUserId: string, accessToken: string): Promise<void> {
    await this.httpJson<{ success?: boolean }>(
      `${this.graphVersioned()}/${igUserId}/subscribed_apps`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
    );
  }

  private graphVersioned(): string {
    return `${IG_GRAPH_BASE}/${this.config.meta.graphApiVersion}`;
  }

  // -------------------------------------------------------------------------

  private async httpJson<T>(url: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(IG_REQUEST_TIMEOUT_MS) });
    } catch (error) {
      const isTimeout = (error as Error).name === 'TimeoutError';
      this.logger.error(
        `Instagram API ${isTimeout ? 'timed out' : 'unreachable'} on ${init.method} ${stripQuery(url)}: ${(error as Error).message}`,
      );
      throw new BadGatewayException(
        isTimeout
          ? 'Instagram did not respond in time. Please try again.'
          : 'Could not reach the Instagram API',
      );
    }

    const body = (await response.json().catch(() => ({}))) as T & GraphErrorBody;

    if (!response.ok || body.error || body.error_message) {
      const message =
        body.error?.message ??
        body.error_message ??
        `Instagram API responded with ${response.status}`;
      // Never log tokens — the URL/body may contain access_token, strip the query.
      this.logger.warn(`Instagram API error on ${init.method} ${stripQuery(url)}: ${message}`);
      throw new InstagramApiError(message, body.error?.code);
    }

    return body;
  }
}

function stripQuery(url: string): string {
  return url.split('?')[0];
}
