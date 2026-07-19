import { Prisma, type PrismaClient } from '@prisma/client';

import { logger } from '../logger/logger';

/** -1 in a plan limit means "unlimited". */
export const UNLIMITED = -1;

/** UTC calendar-month key, e.g. "2026-07" — matches UsageTracking.period. */
export function currentPeriod(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
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

/** DMs already counted this month for the org. */
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
 * Atomically +1 the org's monthly DM counter (DB-level `increment`, never
 * read-then-write). Tolerates the create/create race between concurrent workers
 * by falling back to a pure update on a unique-constraint hit.
 */
export async function incrementDmUsage(
  prisma: PrismaClient,
  organizationId: string,
  period: string,
): Promise<void> {
  const where = {
    organizationId_metric_period: { organizationId, metric: 'MESSAGES_SENT' as const, period },
  };
  try {
    await prisma.usageTracking.upsert({
      where,
      update: { count: { increment: 1 } },
      create: { organizationId, metric: 'MESSAGES_SENT', period, count: 1 },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      // Another worker created the row between our upsert's find + create — the
      // row now exists, so a plain atomic increment is safe.
      await prisma.usageTracking.update({ where, data: { count: { increment: 1 } } });
      return;
    }
    throw error;
  }
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
