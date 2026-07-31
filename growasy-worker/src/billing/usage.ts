import { Prisma, type PrismaClient } from '@prisma/client';

import { logger } from '../logger/logger';

/** -1 in a plan limit means "unlimited". */
export const UNLIMITED = -1;

/** UTC calendar-month key, e.g. "2026-07" — the fallback when there's no plan. */
export function currentPeriod(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/**
 * The DM-quota period key aligned to the subscription's billing anchor (the day
 * of month it started), so the monthly counter resets on the billing
 * anniversary — not on calendar-month boundaries. Returns "YYYY-MM-DD" of the
 * current window's start. Falls back to the calendar month ("YYYY-MM") when
 * there's no subscription anchor.
 */
export function billingPeriodKey(anchor: Date | null | undefined, now = new Date()): string {
  if (!anchor) return currentPeriod(now);
  const anchorDay = anchor.getUTCDate();
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth(); // 0-11
  const startThisMonth = Math.min(anchorDay, daysInMonth(y, m));
  if (now.getUTCDate() < startThisMonth) {
    m -= 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
  }
  const startDay = Math.min(anchorDay, daysInMonth(y, m));
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
}

/**
 * The org's monthly DM cap from its plan. Returns null when there's no
 * subscription (fresh dev install) or the limit is unlimited — either way the
 * caller should NOT block.
 */
export async function getMonthlyDmLimit(
  prisma: PrismaClient,
  organizationId: string,
): Promise<number | null> {
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
    include: { plan: true },
  });
  if (!subscription) return null;
  try {
    const limits = JSON.parse(subscription.plan.limits) as { maxMessagesPerMonth?: number };
    const max = limits.maxMessagesPerMonth;
    if (typeof max !== 'number' || max === UNLIMITED) return null;
    return max;
  } catch {
    logger.warn({ organizationId }, 'plan limits JSON malformed — not enforcing DM limit');
    return null;
  }
}

/**
 * One-query DM quota context: the monthly limit (null = unlimited / no sub) and
 * the billing-anchored period key to count/increment against.
 */
export async function getDmQuota(
  prisma: PrismaClient,
  organizationId: string,
): Promise<{ limit: number | null; period: string }> {
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
    include: { plan: true },
  });
  const period = billingPeriodKey(subscription?.currentPeriodStart ?? null);
  if (!subscription) return { limit: null, period };
  try {
    const limits = JSON.parse(subscription.plan.limits) as { maxMessagesPerMonth?: number };
    const max = limits.maxMessagesPerMonth;
    const limit = typeof max !== 'number' || max === UNLIMITED ? null : max;
    return { limit, period };
  } catch {
    logger.warn({ organizationId }, 'plan limits JSON malformed — not enforcing DM limit');
    return { limit: null, period };
  }
}

/** DMs already counted this period for the org. */
export async function getMonthlyDmCount(
  prisma: PrismaClient,
  organizationId: string,
  period: string,
): Promise<number> {
  const row = await prisma.usageTracking.findUnique({
    where: {
      organizationId_metric_period: { organizationId, metric: 'MESSAGES_SENT', period },
    },
  });
  return row?.count ?? 0;
}

/**
 * Atomically +1 the org's DM counter and RETURN the new count (DB-level
 * `increment`, never read-then-write). Used as a reservation before sending so
 * the cap can't be overshot by concurrent workers. Tolerates the create/create
 * race by falling back to a pure update on a unique-constraint hit.
 */
export async function incrementDmUsage(
  prisma: PrismaClient,
  organizationId: string,
  period: string,
): Promise<number> {
  const where = {
    organizationId_metric_period: { organizationId, metric: 'MESSAGES_SENT' as const, period },
  };
  try {
    const row = await prisma.usageTracking.upsert({
      where,
      update: { count: { increment: 1 } },
      create: { organizationId, metric: 'MESSAGES_SENT', period, count: 1 },
    });
    return row.count;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      // Another worker created the row between our upsert's find + create — the
      // row now exists, so a plain atomic increment is safe.
      const row = await prisma.usageTracking.update({ where, data: { count: { increment: 1 } } });
      return row.count;
    }
    throw error;
  }
}

/**
 * Releases a reserved DM slot — used when the reservation was over the cap or
 * the send failed, so the counter only ever reflects successful sends. Guarded
 * so the count never goes negative.
 */
export async function decrementDmUsage(
  prisma: PrismaClient,
  organizationId: string,
  period: string,
): Promise<void> {
  await prisma.usageTracking.updateMany({
    where: { organizationId, metric: 'MESSAGES_SENT', period, count: { gt: 0 } },
    data: { count: { decrement: 1 } },
  });
}

/**
 * One-time-per-month billing notification when an org hits its DM cap. Deduped
 * on (org, BILLING, period) via the metadata JSON so we don't spam a
 * notification for every blocked comment.
 */
export async function notifyMonthlyDmLimit(
  prisma: PrismaClient,
  organizationId: string,
  userId: string | null,
  period: string,
): Promise<void> {
  if (!userId) return; // no recipient on file — nothing to notify
  const already = await prisma.notification.findFirst({
    where: {
      organizationId,
      type: 'BILLING',
      metadata: { contains: `"period":"${period}"` },
    },
    select: { id: true },
  });
  if (already) return;

  await prisma.notification.create({
    data: {
      organizationId,
      userId,
      type: 'BILLING',
      title: 'Monthly DM limit reached',
      body: 'Upgrade your plan to continue sending automated DMs this month.',
      metadata: JSON.stringify({ reason: 'monthly_dm_limit', period }),
    },
  });
}
