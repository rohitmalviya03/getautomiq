import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { MailQueueService } from '../../queues/mail-queue.service';

/** How many days before the end date the heads-up email goes out. */
const EXPIRY_REMINDER_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "5 August 2026" — one wording shared by the email and the in-app notice. */
function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Stable per-period key so re-running the cron can't send the same mail twice. */
function periodKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailQueue: MailQueueService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM, { name: 'billing-cycle-advance' })
  async advanceEndedPeriods(): Promise<void> {
    const now = new Date();
    const ended = await this.prisma.subscription.findMany({
      // `cancelAtPeriodEnd` subscriptions are excluded: they are not renewing, so
      // rolling their period forward would keep them alive for ever. lapseEndedPlans
      // moves those to Free instead.
      where: {
        currentPeriodEnd: { lt: now },
        status: { in: ['ACTIVE', 'TRIALING'] },
        cancelAtPeriodEnd: false,
      },
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

  /**
   * Warns owners whose plan is about to lapse.
   *
   * Only subscriptions flagged `cancelAtPeriodEnd` are considered — a plan that
   * simply rolls over is not ending, and mailing those users would be a false
   * alarm. Both the queued mail and the in-app notice are keyed by the period
   * end date, so running this daily (or twice after a restart) sends one email.
   */
  @Cron(CronExpression.EVERY_DAY_AT_8AM, { name: 'plan-expiry-reminder' })
  async notifyExpiringPlans(): Promise<void> {
    const now = new Date();
    const horizon = new Date(now.getTime() + EXPIRY_REMINDER_DAYS * DAY_MS);

    const ending = await this.prisma.subscription.findMany({
      where: {
        cancelAtPeriodEnd: true,
        status: { in: ['ACTIVE', 'TRIALING'] },
        currentPeriodEnd: { gt: now, lte: horizon },
      },
      include: {
        plan: { select: { name: true, tier: true } },
        organization: {
          select: { id: true, ownerId: true, owner: { select: { email: true, firstName: true } } },
        },
      },
    });

    let sent = 0;
    for (const sub of ending) {
      const owner = sub.organization.owner;
      if (!owner?.email) continue;

      const daysLeft = Math.max(
        1,
        Math.ceil((sub.currentPeriodEnd.getTime() - now.getTime()) / DAY_MS),
      );
      const key = `${sub.id}-${periodKey(sub.currentPeriodEnd)}`;

      try {
        await this.mailQueue.sendPlanExpiringEmail(
          {
            toEmail: owner.email,
            firstName: owner.firstName,
            planName: sub.plan.name,
            endsAt: formatDate(sub.currentPeriodEnd),
            daysLeft,
          },
          key,
        );
        await this.upsertNotice(sub.organization.id, sub.organization.ownerId, {
          reason: 'plan_expiring',
          key,
          title: `Your ${sub.plan.name} plan ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
          body: `${sub.plan.name} ends on ${formatDate(sub.currentPeriodEnd)}. Renew to keep your automations running.`,
        });
        sent += 1;
      } catch (e) {
        // One bad row must not stop the rest of the batch.
        this.logger.warn(`expiry reminder failed for subscription ${sub.id}: ${String(e)}`);
      }
    }

    if (sent > 0) this.logger.log(`Queued ${sent} plan-expiry reminder(s)`);
  }

  /**
   * Moves non-renewing plans onto Free once their paid period has ended, then
   * tells the owner.
   *
   * This is what the cancel dialog already promises ("you keep it until the
   * period ends, then move to Free"). Nothing is deleted — only the plan the
   * subscription points at changes, so limits and gated features fall back to
   * Free while automations, contacts and history stay untouched.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM, { name: 'plan-lapse-to-free' })
  async lapseEndedPlans(): Promise<void> {
    const now = new Date();

    const free = await this.prisma.plan.findFirst({
      where: { tier: 'FREE' },
      select: { id: true },
    });
    if (!free) {
      // Without a Free plan row there is nothing to fall back to; leaving the
      // paid plan in place is far safer than removing the subscription.
      this.logger.error('No FREE plan row — skipping plan lapse scan');
      return;
    }

    const lapsed = await this.prisma.subscription.findMany({
      where: {
        cancelAtPeriodEnd: true,
        status: { in: ['ACTIVE', 'TRIALING'] },
        currentPeriodEnd: { lt: now },
        plan: { tier: { not: 'FREE' } },
      },
      include: {
        plan: { select: { name: true } },
        organization: {
          select: { id: true, ownerId: true, owner: { select: { email: true, firstName: true } } },
        },
      },
    });

    let moved = 0;
    for (const sub of lapsed) {
      const key = `${sub.id}-${periodKey(sub.currentPeriodEnd)}`;
      try {
        await this.prisma.subscription.update({
          where: { id: sub.id },
          data: {
            planId: free.id,
            status: 'ACTIVE',
            cancelAtPeriodEnd: false,
            // Re-anchor the period so DM quota windows keep making sense.
            currentPeriodStart: now,
            currentPeriodEnd: new Date(now.getTime() + 30 * DAY_MS),
          },
        });
        moved += 1;

        const owner = sub.organization.owner;
        if (owner?.email) {
          await this.mailQueue.sendPlanExpiredEmail(
            { toEmail: owner.email, firstName: owner.firstName, planName: sub.plan.name },
            key,
          );
        }
        await this.upsertNotice(sub.organization.id, sub.organization.ownerId, {
          reason: 'plan_expired',
          key,
          title: `Your ${sub.plan.name} plan has ended`,
          body: "You're on the Free plan now. Your automations and contacts are safe — upgrade any time to restore your limits.",
        });
      } catch (e) {
        this.logger.warn(`plan lapse failed for subscription ${sub.id}: ${String(e)}`);
      }
    }

    if (moved > 0) this.logger.log(`Lapsed ${moved} subscription(s) to Free`);
  }

  /**
   * Writes the in-app notice, skipping it when one already exists for this
   * period — the metadata carries the same key the mail job is deduped on.
   */
  private async upsertNotice(
    organizationId: string,
    userId: string,
    notice: { reason: string; key: string; title: string; body: string },
  ): Promise<void> {
    const existing = await this.prisma.notification.findFirst({
      where: {
        organizationId,
        userId,
        type: 'BILLING',
        metadata: { contains: notice.key },
      },
      select: { id: true },
    });
    if (existing) return;

    await this.prisma.notification.create({
      data: {
        organizationId,
        userId,
        type: 'BILLING',
        title: notice.title,
        body: notice.body,
        metadata: JSON.stringify({ reason: notice.reason, key: notice.key }),
      },
    });
  }
}
