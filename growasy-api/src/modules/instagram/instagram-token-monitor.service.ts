import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenEncryptionService } from '../../common/services/token-encryption.service';
import { MetaGraphService } from './meta-graph.service';

/** Try to renew once the token has less than this much life left. */
const REFRESH_WINDOW_MS = 10 * 24 * 60 * 60 * 1000;
/** Flag accounts whose token expires within this window so users reconnect early. */
const RECONNECT_WARNING_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
/**
 * Instagram refuses to refresh a token younger than 24h. Skipping those avoids a
 * guaranteed-failing call — they'll be picked up on a later run anyway.
 */
const MIN_TOKEN_AGE_MS = 25 * 60 * 60 * 1000;

/**
 * Keeps long-lived Instagram tokens alive.
 *
 * A ~60-day token that silently lapses breaks the comment→DM automation without
 * warning. Once a day we first try to RENEW tokens nearing expiry (Instagram
 * grants another 60 days for any valid token ≥24h old), and only fall back to
 * flagging NEEDS_RECONNECT for the ones that couldn't be renewed — a revoked
 * token, a changed password, or an account that lost the permission.
 *
 * Renewal runs before the flagging pass, so an account that renews cleanly never
 * shows the customer a reconnect prompt.
 */
@Injectable()
export class InstagramTokenMonitorService {
  private readonly logger = new Logger(InstagramTokenMonitorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metaGraph: MetaGraphService,
    private readonly tokenEncryption: TokenEncryptionService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'instagram-token-expiry-scan' })
  async scanTokens(): Promise<void> {
    await this.refreshExpiringTokens();
    await this.flagExpiringTokens();
  }

  /**
   * Renews tokens inside the refresh window. Each account is handled on its own
   * so one dead token can't stop the rest of the batch.
   */
  async refreshExpiringTokens(): Promise<void> {
    const now = Date.now();
    const candidates = await this.prisma.instagramAccount.findMany({
      where: {
        status: 'CONNECTED',
        deletedAt: null,
        tokenExpiresAt: { not: null, lte: new Date(now + REFRESH_WINDOW_MS), gt: new Date(now) },
      },
      select: { id: true, username: true, accessTokenEncrypted: true, updatedAt: true },
    });

    let renewed = 0;
    let failed = 0;

    for (const account of candidates) {
      // Instagram rejects a refresh on a token less than 24h old.
      if (now - account.updatedAt.getTime() < MIN_TOKEN_AGE_MS) continue;

      try {
        const current = this.tokenEncryption.decrypt(account.accessTokenEncrypted);
        const refreshed = await this.metaGraph.refreshLongLivedToken(current);

        await this.prisma.instagramAccount.update({
          where: { id: account.id },
          data: {
            accessTokenEncrypted: this.tokenEncryption.encrypt(refreshed.accessToken),
            tokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
          },
        });
        renewed += 1;
      } catch (e) {
        // Leave the account CONNECTED — the flagging pass below decides whether
        // it is close enough to expiry to prompt the customer to reconnect.
        failed += 1;
        this.logger.warn(
          `Token refresh failed for @${account.username} (${account.id}): ${String(e)}`,
        );
      }
    }

    if (renewed > 0 || failed > 0) {
      this.logger.log(`Instagram token refresh: ${renewed} renewed, ${failed} failed`);
    } else {
      this.logger.debug('Token refresh scan: nothing due');
    }
  }

  /**
   * Anything still near expiry after the refresh pass genuinely needs the user
   * to reconnect. Unchanged behaviour — it just runs on a smaller set now.
   */
  async flagExpiringTokens(): Promise<void> {
    const threshold = new Date(Date.now() + RECONNECT_WARNING_WINDOW_MS);

    const result = await this.prisma.instagramAccount.updateMany({
      where: {
        status: 'CONNECTED',
        deletedAt: null,
        tokenExpiresAt: { not: null, lte: threshold },
      },
      data: { status: 'NEEDS_RECONNECT' },
    });

    if (result.count > 0) {
      this.logger.warn(
        `Flagged ${result.count} Instagram account(s) as NEEDS_RECONNECT (token expiring within 3 days)`,
      );
    } else {
      this.logger.debug('Token expiry scan: no accounts nearing expiry');
    }
  }
}
