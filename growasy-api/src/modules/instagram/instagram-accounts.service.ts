import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InstagramAccount } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { TokenEncryptionService } from '../../common/services/token-encryption.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { MetaGraphService } from './meta-graph.service';

const OAUTH_STATE_TTL = '10m';

interface OAuthStatePayload {
  purpose: 'ig_oauth';
  organizationId: string;
  userId: string;
  /** Set when this flow is a reconnect of an existing account (not a fresh connect). */
  reconnectAccountId?: string;
}

/** Fields safe to return to clients — accessTokenEncrypted must never leave the server. */
const PUBLIC_ACCOUNT_SELECT = {
  id: true,
  instagramBusinessId: true,
  facebookPageId: true,
  username: true,
  name: true,
  profilePictureUrl: true,
  status: true,
  connectedByUserId: true,
  lastSyncedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class InstagramAccountsService {
  private readonly logger = new Logger(InstagramAccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metaGraph: MetaGraphService,
    private readonly tokenEncryption: TokenEncryptionService,
    private readonly jwtService: JwtService,
    private readonly config: AppConfigService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  // ---------------------------------------------------------------------
  // OAuth flow (Instagram API with Instagram Login)
  // ---------------------------------------------------------------------

  /**
   * Step 1: signed state (CSRF) + the Instagram authorization URL. When
   * `reconnectAccountId` is supplied the state carries it through so the
   * callback can enforce that the user re-authorizes the *same* account.
   */
  getAuthorizationUrl(
    organizationId: string,
    userId: string,
    reconnectAccountId?: string,
  ): { url: string; state: string } {
    this.metaGraph.assertConfigured();
    const payload: OAuthStatePayload = { purpose: 'ig_oauth', organizationId, userId };
    if (reconnectAccountId) {
      payload.reconnectAccountId = reconnectAccountId;
    }
    const state = this.jwtService.sign(payload, {
      secret: this.config.jwt.accessSecret,
      expiresIn: OAUTH_STATE_TTL,
    });
    // New connect → force the account chooser so a second, DIFFERENT account can be
    // added. Reconnect → keep the same account, no forced re-auth.
    const forceReauth = !reconnectAccountId;
    return { url: this.metaGraph.buildAuthorizationUrl(state, forceReauth), state };
  }

  /**
   * Step 2: the whole connect happens here — validate state, exchange the code
   * for a short-lived token, upgrade to a long-lived (~60 day) token, fetch the
   * profile, and persist the single connected Instagram account. There is no
   * Facebook-Page selection step in this flow: one login → one account.
   */
  async handleOAuthCallback(organizationId: string, userId: string, code: string, state: string) {
    const { reconnectAccountId } = this.verifyState(organizationId, userId, state);

    const shortLived = await this.metaGraph.exchangeCodeForToken(code);
    const longLived = await this.metaGraph.exchangeForLongLivedToken(shortLived.accessToken);
    const profile = await this.metaGraph.getProfile(longLived.accessToken);

    // `instagramBusinessId` is globally unique, so look the identity up across
    // ALL workspaces AND including soft-deleted (removed) rows — otherwise a row
    // that was removed from another workspace stays invisible here yet still
    // collides on the upsert below, silently resurrecting it under the wrong org.
    const existing = await this.prisma.instagramAccount.findFirst({
      where: { instagramBusinessId: profile.id },
    });
    const isLive = !!existing && !existing.deletedAt;

    // A LIVE account in a different workspace is a hard conflict — one Instagram
    // identity can only be connected to one workspace at a time.
    if (isLive && existing!.organizationId !== organizationId) {
      throw new ConflictException(
        'This Instagram account is already connected to another workspace',
      );
    }

    // Reconnect guard: must re-authorize the SAME live account, in THIS workspace.
    if (
      reconnectAccountId &&
      (!isLive ||
        existing!.id !== reconnectAccountId ||
        existing!.organizationId !== organizationId)
    ) {
      throw new BadRequestException(
        'Yeh Instagram account tumhare pehle wale connected account se match nahi karta. Sahi account se login karo.',
      );
    }

    // Plan limit applies only when adding a genuinely new live account to THIS
    // org (a same-org reconnect or re-claim of a freed account must not be blocked).
    const alreadyLiveInThisOrg = isLive && existing!.organizationId === organizationId;
    if (!alreadyLiveInThisOrg) {
      await this.planLimits.assertCanConnectAccount(organizationId);
    }

    // Re-claiming a soft-deleted row that belonged to a DIFFERENT workspace:
    // archive that workspace's now-dead automation rules so they can't fire on
    // the account once it lives under the new org.
    if (existing && existing.deletedAt && existing.organizationId !== organizationId) {
      await this.prisma.automationRule.updateMany({
        where: { instagramAccountId: existing.id, deletedAt: null },
        data: { status: 'ARCHIVED', deletedAt: new Date() },
      });
      this.logger.log(
        `Reassigning IG account ${profile.id} from org ${existing.organizationId} to ${organizationId} — archived old rules`,
      );
    }

    const tokenExpiresAt = new Date(Date.now() + longLived.expiresIn * 1000);

    const account = await this.prisma.instagramAccount.upsert({
      where: { instagramBusinessId: profile.id },
      create: {
        organizationId,
        instagramBusinessId: profile.id,
        appScopedId: profile.appScopedId,
        facebookPageId: null, // no Facebook Page in the Instagram Login flow
        username: profile.username,
        name: profile.name,
        profilePictureUrl: profile.profilePictureUrl,
        accessTokenEncrypted: this.tokenEncryption.encrypt(longLived.accessToken),
        tokenExpiresAt,
        scopes: JSON.stringify(this.config.meta.oauthScopes.split(',')),
        status: 'CONNECTED',
        connectedByUserId: userId,
        lastSyncedAt: new Date(),
      },
      update: {
        // Claim the row for the connecting workspace (safe: a LIVE account in
        // another org was already rejected above). A same-org reconnect keeps its
        // org; a freed/removed account is reassigned here.
        organizationId,
        connectedByUserId: userId,
        appScopedId: profile.appScopedId,
        accessTokenEncrypted: this.tokenEncryption.encrypt(longLived.accessToken),
        tokenExpiresAt,
        username: profile.username,
        name: profile.name,
        profilePictureUrl: profile.profilePictureUrl,
        scopes: JSON.stringify(this.config.meta.oauthScopes.split(',')),
        status: 'CONNECTED',
        deletedAt: null,
        lastSyncedAt: new Date(),
      },
      select: PUBLIC_ACCOUNT_SELECT,
    });

    // Subscribe the account to webhooks so Meta actually delivers its comment
    // events. Best-effort — a failure here shouldn't fail the whole connect
    // (the user can retry via Sync), but it's why comment→DM wouldn't fire.
    await this.subscribeToWebhooks(profile.id, longLived.accessToken, account.username);

    this.logger.log(
      `IG account @${account.username} ${existing ? 'reconnected' : 'connected'} to org ${organizationId}`,
    );
    return account;
  }

  /** Best-effort webhook subscription — logs but never throws. */
  private async subscribeToWebhooks(
    igUserId: string,
    accessToken: string,
    username: string,
  ): Promise<void> {
    try {
      await this.metaGraph.subscribeToWebhooks(igUserId, accessToken);
      // Read it back so the log shows exactly what Meta has on file — an empty
      // `data: []` here means the account is NOT actually subscribed.
      const status = await this.metaGraph.getSubscribedApps(igUserId, accessToken);
      this.logger.log(`Webhook subscription for @${username}: ${JSON.stringify(status)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Webhook subscription failed for @${username}: ${message}`);
    }
  }

  private verifyState(organizationId: string, userId: string, state: string): OAuthStatePayload {
    let payload: OAuthStatePayload;
    try {
      payload = this.jwtService.verify<OAuthStatePayload>(state, {
        secret: this.config.jwt.accessSecret,
      });
    } catch {
      throw new UnauthorizedException(
        'This connection attempt is invalid or has expired — restart the connect flow',
      );
    }
    if (
      payload.purpose !== 'ig_oauth' ||
      payload.organizationId !== organizationId ||
      payload.userId !== userId
    ) {
      throw new UnauthorizedException('Connection state does not match this user/organization');
    }
    return payload;
  }

  // ---------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------

  async listForOrganization(organizationId: string) {
    return this.prisma.instagramAccount.findMany({
      where: { organizationId, deletedAt: null },
      select: PUBLIC_ACCOUNT_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async findById(organizationId: string, accountId: string) {
    const account = await this.prisma.instagramAccount.findFirst({
      where: { id: accountId, organizationId, deletedAt: null },
      select: PUBLIC_ACCOUNT_SELECT,
    });
    if (!account) {
      throw new NotFoundException('Instagram account not found');
    }
    return account;
  }

  /**
   * Removes an Instagram account from the workspace: unsubscribes it from Meta
   * webhooks (best-effort — so comment events stop arriving), then soft-deletes
   * the row. Frees the plan's account slot (counts filter deletedAt: null) and
   * is reversible via the reconnect flow (which un-deletes the same row).
   */
  async disconnect(organizationId: string, accountId: string) {
    const account = await this.prisma.instagramAccount.findFirst({
      where: { id: accountId, organizationId, deletedAt: null },
    });
    if (!account) {
      throw new NotFoundException('Instagram account not found');
    }

    // Best-effort: tell Meta to stop sending this account's webhooks. A dead
    // token here shouldn't block removal — the row is being detached anyway.
    try {
      const token = this.tokenEncryption.decrypt(account.accessTokenEncrypted);
      await this.metaGraph.unsubscribeFromWebhooks(account.instagramBusinessId, token);
      this.logger.log(`Unsubscribed @${account.username} from webhooks on removal`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Webhook unsubscribe failed for @${account.username}: ${message}`);
    }

    await this.prisma.instagramAccount.update({
      where: { id: accountId },
      data: { status: 'DISCONNECTED', deletedAt: new Date() },
    });
  }

  /** Re-pulls profile fields from the Instagram Graph API using the stored token. */
  async syncProfile(organizationId: string, accountId: string) {
    const account = await this.prisma.instagramAccount.findFirst({
      where: { id: accountId, organizationId, deletedAt: null },
    });
    if (!account) {
      throw new NotFoundException('Instagram account not found');
    }

    const token = this.tokenEncryption.decrypt(account.accessTokenEncrypted);

    let profile;
    try {
      profile = await this.metaGraph.getProfile(token);
    } catch (error) {
      // A dead/expired token is the most common cause — surface it in the status.
      await this.prisma.instagramAccount.update({
        where: { id: accountId },
        data: { status: 'ERROR' },
      });
      throw error;
    }

    // Re-assert the webhook subscription on every sync — this is how an already
    // connected account (connected before subscription existed) gets subscribed.
    await this.subscribeToWebhooks(account.instagramBusinessId, token, profile.username);

    return this.prisma.instagramAccount.update({
      where: { id: accountId },
      data: {
        username: profile.username,
        name: profile.name,
        profilePictureUrl: profile.profilePictureUrl,
        status: 'CONNECTED',
        lastSyncedAt: new Date(),
      },
      select: PUBLIC_ACCOUNT_SELECT,
    });
  }

  /**
   * Lists the account's recent posts + reels for the automation builder's media
   * picker. Decrypts the token server-side and returns only public media
   * metadata — the token never leaves the server.
   */
  async listMedia(organizationId: string, accountId: string) {
    const account = await this.prisma.instagramAccount.findFirst({
      where: { id: accountId, organizationId, deletedAt: null },
      select: { id: true, accessTokenEncrypted: true, status: true },
    });
    if (!account) {
      throw new NotFoundException('Instagram account not found');
    }

    const token = this.tokenEncryption.decrypt(account.accessTokenEncrypted);
    return this.metaGraph.listMedia(token);
  }

  /** Internal helper for other modules (automation engine, messaging) — never expose via HTTP. */
  async getDecryptedToken(
    account: Pick<InstagramAccount, 'accessTokenEncrypted'>,
  ): Promise<string> {
    return this.tokenEncryption.decrypt(account.accessTokenEncrypted);
  }
}
