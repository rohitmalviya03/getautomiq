import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

/** Flag accounts whose token expires within this window so users reconnect early. */
const RECONNECT_WARNING_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Proactively watches long-lived Instagram token expiry. A ~60-day token that
 * silently lapses would make the comment→DM automation fail without warning, so
 * once a day we flip CONNECTED accounts nearing expiry to NEEDS_RECONNECT — that
 * status surfaces a "Reconnect" prompt in the dashboard before anything breaks.
 */
@Injectable()
export class InstagramTokenMonitorService {
  private readonly logger = new Logger(InstagramTokenMonitorService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'instagram-token-expiry-scan' })
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
