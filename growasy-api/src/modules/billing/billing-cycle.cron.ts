import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

/** Adds one billing interval to a period-end date. */
function advance(from: Date, cycle: 'MONTHLY' | 'YEARLY'): Date {
  const next = new Date(from);
  if (cycle === 'YEARLY') {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
  } else {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return next;
}

/**
 * Rolls each active subscription's billing-cycle anchor forward once its period
 * has ended. DM usage itself needs no explicit reset — UsageTracking is keyed by
 * calendar month ("YYYY-MM"), so a new month naturally starts a fresh counter
 * (the first send of the month lazily creates a count-0 row). This cron keeps
 * `currentPeriodStart/End` current so the usage endpoint reports the right
 * billing anchor. Reuses the same @Cron/ScheduleModule pattern as the Instagram
 * token-expiry monitor.
 */
@Injectable()
export class BillingCycleCron {
  private readonly logger = new Logger(BillingCycleCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM, { name: 'billing-cycle-advance' })
  async advanceEndedPeriods(): Promise<void> {
    const now = new Date();
    const ended = await this.prisma.subscription.findMany({
      where: { currentPeriodEnd: { lt: now }, status: { in: ['ACTIVE', 'TRIALING'] } },
      select: { id: true, currentPeriodEnd: true, billingCycle: true },
    });

    let rolled = 0;
    for (const sub of ended) {
      // Fast-forward in whole intervals until the period covers "now" (handles a
      // subscription that was dormant for several months).
      let start = sub.currentPeriodEnd;
      let end = advance(start, sub.billingCycle);
      while (end < now) {
        start = end;
        end = advance(start, sub.billingCycle);
      }
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { currentPeriodStart: start, currentPeriodEnd: end },
      });
      rolled += 1;
    }

    if (rolled > 0) {
      this.logger.log(`Advanced billing cycle for ${rolled} subscription(s)`);
    } else {
      this.logger.debug('Billing-cycle scan: no subscriptions needed advancing');
    }
  }
}
