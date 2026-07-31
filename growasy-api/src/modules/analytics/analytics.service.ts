import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';

const DEFAULT_RANGE_DAYS = 30;

interface DayCountRow {
  day: Date | string;
  cnt: bigint | number;
}

interface PostStatRow {
  mediaId: string;
  accountId: string;
  total: bigint | number;
  matched: bigint | number | null;
  dmSent: bigint | number | null;
  lastAt: Date | string;
}

function toDateKey(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 1000) / 1000;
}

/**
 * Read-only analytics over the comment→DM pipeline. Aggregates the existing
 * `ProcessedComment` ledger + `UsageTracking` — no new tables. All queries are
 * scoped to the org's Instagram accounts.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  async getOverview(organizationId: string, rangeDays = DEFAULT_RANGE_DAYS) {
    const accounts = await this.prisma.instagramAccount.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true },
    });
    const accountIds = accounts.map((a) => a.id);
    const usage = await this.planLimits.getUsageSummary(organizationId);

    // No connected accounts → nothing to aggregate; return a zeroed shape.
    if (accountIds.length === 0) {
      return {
        rangeDays,
        totals: {
          commentsProcessed: 0,
          matched: 0,
          dmsSent: 0,
          contactsReached: 0,
          matchRate: 0,
          dmDeliveryRate: 0,
        },
        dmsPerDay: this.zeroFilledDays(rangeDays, new Map()),
        outcomeBreakdown: [],
        topRules: [],
        usage: { dmsUsedThisMonth: usage.dmsUsedThisMonth, dmsLimit: usage.dmsLimit },
      };
    }

    const dateFrom = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
    const scoped: Prisma.ProcessedCommentWhereInput = {
      instagramAccountId: { in: accountIds },
      createdAt: { gte: dateFrom },
    };

    const [
      commentsProcessed,
      matched,
      dmsSent,
      contactsReached,
      outcomeGroups,
      ruleGroups,
      dailyRows,
    ] = await Promise.all([
      this.prisma.processedComment.count({ where: scoped }),
      this.prisma.processedComment.count({ where: { ...scoped, matched: true } }),
      this.prisma.processedComment.count({ where: { ...scoped, dmSent: true } }),
      this.prisma.contact.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.processedComment.groupBy({
        by: ['outcome'],
        where: scoped,
        _count: { _all: true },
      }),
      this.prisma.processedComment.groupBy({
        by: ['ruleId'],
        where: { ...scoped, dmSent: true, ruleId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { ruleId: 'desc' } },
        take: 5,
      }),
      this.prisma.$queryRaw<DayCountRow[]>(Prisma.sql`
          SELECT DATE(createdAt) AS day, COUNT(*) AS cnt
          FROM ProcessedComment
          WHERE dmSent = true
            AND createdAt >= ${dateFrom}
            AND instagramAccountId IN (${Prisma.join(accountIds)})
          GROUP BY DATE(createdAt)
        `),
    ]);

    // Attach rule names to the top-rules breakdown.
    const topRuleIds = ruleGroups.map((g) => g.ruleId).filter((id): id is string => Boolean(id));
    const ruleNames = new Map(
      (
        await this.prisma.automationRule.findMany({
          where: { id: { in: topRuleIds } },
          select: { id: true, name: true },
        })
      ).map((r) => [r.id, r.name]),
    );

    const dailyMap = new Map<string, number>(
      dailyRows.map((r) => [toDateKey(r.day), Number(r.cnt)]),
    );

    return {
      rangeDays,
      totals: {
        commentsProcessed,
        matched,
        dmsSent,
        contactsReached,
        matchRate: ratio(matched, commentsProcessed),
        dmDeliveryRate: ratio(dmsSent, matched),
      },
      dmsPerDay: this.zeroFilledDays(rangeDays, dailyMap),
      outcomeBreakdown: outcomeGroups
        .map((g) => ({ outcome: g.outcome ?? 'unknown', count: g._count._all }))
        .sort((a, b) => b.count - a.count),
      topRules: ruleGroups.map((g) => ({
        ruleId: g.ruleId,
        name: g.ruleId ? (ruleNames.get(g.ruleId) ?? 'Deleted rule') : 'Unknown',
        dmsSent: g._count._all,
      })),
      usage: { dmsUsedThisMonth: usage.dmsUsedThisMonth, dmsLimit: usage.dmsLimit },
    };
  }

  /**
   * Per-post / per-reel analytics: for each media that automations ran on,
   * how many comments were processed, matched, and DM'd — plus the rules bound
   * to it. Gated to Starter+ at the controller (@RequireFeature ANALYTICS).
   */
  async getPostAnalytics(organizationId: string, rangeDays = DEFAULT_RANGE_DAYS) {
    const accounts = await this.prisma.instagramAccount.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true },
    });
    const accountIds = accounts.map((a) => a.id);
    if (accountIds.length === 0) return { rangeDays, posts: [] };

    const dateFrom = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.$queryRaw<PostStatRow[]>(Prisma.sql`
        SELECT mediaId,
               instagramAccountId AS accountId,
               COUNT(*)        AS total,
               SUM(matched)    AS matched,
               SUM(dmSent)     AS dmSent,
               MAX(createdAt)  AS lastAt
        FROM ProcessedComment
        WHERE mediaId IS NOT NULL
          AND instagramAccountId IN (${Prisma.join(accountIds)})
          AND createdAt >= ${dateFrom}
        GROUP BY mediaId, instagramAccountId
        ORDER BY total DESC
        LIMIT 50
      `);
    if (rows.length === 0) return { rangeDays, posts: [] };

    // Which rule(s) fired on each media.
    const mediaIds = rows.map((r) => r.mediaId);
    const ruleGroups = await this.prisma.processedComment.groupBy({
      by: ['mediaId', 'ruleId'],
      where: {
        instagramAccountId: { in: accountIds },
        mediaId: { in: mediaIds },
        ruleId: { not: null },
        createdAt: { gte: dateFrom },
      },
    });
    const ruleIds = [...new Set(ruleGroups.map((g) => g.ruleId).filter((id): id is string => !!id))];
    const ruleName = new Map(
      (
        await this.prisma.automationRule.findMany({
          where: { id: { in: ruleIds } },
          select: { id: true, name: true },
        })
      ).map((r) => [r.id, r.name]),
    );
    const rulesByMedia = new Map<string, string[]>();
    for (const g of ruleGroups) {
      if (!g.mediaId || !g.ruleId) continue;
      const name = ruleName.get(g.ruleId);
      if (!name) continue;
      const arr = rulesByMedia.get(g.mediaId) ?? [];
      if (!arr.includes(name)) arr.push(name);
      rulesByMedia.set(g.mediaId, arr);
    }

    return {
      rangeDays,
      posts: rows.map((r) => {
        const commentsProcessed = Number(r.total);
        const matched = Number(r.matched ?? 0);
        const dmsSent = Number(r.dmSent ?? 0);
        return {
          mediaId: r.mediaId,
          instagramAccountId: r.accountId,
          commentsProcessed,
          matched,
          dmsSent,
          matchRate: ratio(matched, commentsProcessed),
          dmDeliveryRate: ratio(dmsSent, matched),
          ruleNames: rulesByMedia.get(r.mediaId) ?? [],
          lastActivityAt: r.lastAt instanceof Date ? r.lastAt.toISOString() : String(r.lastAt),
        };
      }),
    };
  }

  /** Produces a continuous [{date,count}] series for the last N days (0 where no data). */
  private zeroFilledDays(rangeDays: number, counts: Map<string, number>) {
    const series: Array<{ date: string; count: number }> = [];
    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      series.push({ date: key, count: counts.get(key) ?? 0 });
    }
    return series;
  }
}
