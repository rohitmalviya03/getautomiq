import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

/** Page views older than this are pruned — traffic stats don't need raw rows for ever. */
export const PAGEVIEW_RETENTION_DAYS = 180;

/**
 * User agents we never count. Crawlers inflate "visitors" badly — the landing
 * page alone gets hit by search, social and AI bots many times a day.
 */
const BOT_PATTERN =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|preview|monitor|curl|wget|python-requests|headless|lighthouse|pingdom|uptime/i;

/** App surfaces — anything else counts as public marketing traffic. */
const APP_PATH_PREFIXES = [
  '/dashboard',
  '/instagram',
  '/automations',
  '/workflows',
  '/content',
  '/contacts',
  '/analytics',
  '/links',
  '/billing',
  '/help',
  '/settings',
  '/sessions',
  '/organization',
  '/admin',
];

export interface TrackInput {
  path: string;
  referrer?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  country?: string | null;
  userId?: string | null;
  organizationId?: string | null;
}

function surfaceOf(path: string): 'app' | 'public' {
  return APP_PATH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`)) ? 'app' : 'public';
}

/** Coarse device bucket. Enough to answer "is our traffic mobile?" — nothing finer. */
function deviceOf(ua: string): string {
  if (/ipad|tablet|playbook|silk/i.test(ua)) return 'tablet';
  if (/mobi|iphone|android.*mobile|windows phone/i.test(ua)) return 'mobile';
  return 'desktop';
}

function browserOf(ua: string): string {
  if (/edg\//i.test(ua)) return 'Edge';
  if (/opr\/|opera/i.test(ua)) return 'Opera';
  if (/chrome|crios/i.test(ua)) return 'Chrome';
  if (/firefox|fxios/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua)) return 'Safari';
  return 'Other';
}

/** Referrer host only — query strings routinely carry emails and tokens. */
function referrerHostOf(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '');
    return host.slice(0, 255) || null;
  } catch {
    return null;
  }
}

/** Normalises a path so /automations/abc123 doesn't fragment the top-pages list. */
function normalisePath(raw: string): string {
  const path = raw.split('?')[0].split('#')[0] || '/';
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/:id') // uuids
    .replace(/\/\d{3,}/g, '/:id')
    .slice(0, 500);
}

@Injectable()
export class TrafficService {
  private readonly logger = new Logger(TrafficService.name);

  /**
   * Rotating salt for the visitor hash. Held in memory and re-rolled whenever the
   * UTC day changes, so yesterday's hashes can never be recomputed — not even by
   * us, and not even with the raw IP in hand.
   */
  private salt = randomBytes(32).toString('hex');
  private saltDay = new Date().toISOString().slice(0, 10);

  constructor(private readonly prisma: PrismaService) {}

  private dailySalt(): string {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.saltDay) {
      this.salt = randomBytes(32).toString('hex');
      this.saltDay = today;
    }
    return this.salt;
  }

  /**
   * Records a view. Never throws — analytics must not break a page load, so the
   * caller can fire and forget.
   */
  async track(input: TrackInput): Promise<{ recorded: boolean }> {
    const ua = input.userAgent ?? '';
    if (!input.path || BOT_PATTERN.test(ua)) return { recorded: false };

    try {
      const visitorHash = createHash('sha256')
        .update(`${this.dailySalt()}:${input.ip ?? ''}:${ua}`)
        .digest('hex');
      const path = normalisePath(input.path);

      await this.prisma.pageView.create({
        data: {
          path,
          referrerHost: referrerHostOf(input.referrer),
          visitorHash,
          userId: input.userId ?? null,
          organizationId: input.organizationId ?? null,
          surface: surfaceOf(path),
          deviceType: ua ? deviceOf(ua) : null,
          browser: ua ? browserOf(ua) : null,
          country: input.country?.slice(0, 2).toUpperCase() ?? null,
        },
      });
      return { recorded: true };
    } catch (e) {
      this.logger.warn(`page view not recorded: ${String(e)}`);
      return { recorded: false };
    }
  }

  /** Everything the admin traffic dashboard renders, for the last `days` days. */
  async overview(days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const prevSince = new Date(since.getTime() - days * 24 * 60 * 60 * 1000);

    const [
      views,
      uniqueVisitors,
      signedInUsers,
      prevViews,
      prevUniqueVisitors,
      daily,
      topPages,
      topReferrers,
      devices,
      bySurface,
      signups,
    ] = await Promise.all([
      this.prisma.pageView.count({ where: { createdAt: { gte: since } } }),
      this.distinctCount('visitorHash', since),
      this.distinctCount('userId', since),
      this.prisma.pageView.count({ where: { createdAt: { gte: prevSince, lt: since } } }),
      this.distinctCount('visitorHash', prevSince, since),
      this.dailySeries(since),
      this.groupTop('path', since, 10),
      this.groupTop('referrerHost', since, 10),
      this.groupTop('deviceType', since, 5),
      this.groupTop('surface', since, 5),
      this.prisma.organization.count({ where: { createdAt: { gte: since }, deletedAt: null } }),
    ]);

    return {
      rangeDays: days,
      totals: {
        views,
        uniqueVisitors,
        signedInUsers,
        signups,
        // Visitors who became a workspace. Rough by nature — a signup may come
        // from a visitor first seen outside this window — but it's the number
        // that actually matters, so it's better shown than hidden.
        signupRate: uniqueVisitors > 0 ? Number(((signups / uniqueVisitors) * 100).toFixed(2)) : 0,
      },
      trend: {
        viewsChangePct: pctChange(prevViews, views),
        visitorsChangePct: pctChange(prevUniqueVisitors, uniqueVisitors),
      },
      daily,
      topPages,
      topReferrers,
      devices,
      bySurface,
    };
  }

  /** COUNT(DISTINCT col) — Prisma has no direct equivalent, so raw SQL it is. */
  private async distinctCount(column: 'visitorHash' | 'userId', since: Date, until?: Date) {
    const rows = await this.prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(DISTINCT \`${column}\`) AS n FROM PageView
       WHERE createdAt >= ?${until ? ' AND createdAt < ?' : ''}`,
      since,
      ...(until ? [until] : []),
    );
    return Number(rows[0]?.n ?? 0);
  }

  /** Views + unique visitors per day, for the chart. */
  private async dailySeries(since: Date) {
    const rows = await this.prisma.$queryRawUnsafe<
      { day: string; views: bigint; visitors: bigint }[]
    >(
      `SELECT DATE(createdAt) AS day, COUNT(*) AS views, COUNT(DISTINCT visitorHash) AS visitors
       FROM PageView WHERE createdAt >= ?
       GROUP BY DATE(createdAt) ORDER BY day ASC`,
      since,
    );
    return rows.map((r) => ({
      day: typeof r.day === 'string' ? r.day : new Date(r.day).toISOString().slice(0, 10),
      views: Number(r.views),
      visitors: Number(r.visitors),
    }));
  }

  private async groupTop(
    column: 'path' | 'referrerHost' | 'deviceType' | 'surface',
    since: Date,
    limit: number,
  ) {
    const rows = await this.prisma.$queryRawUnsafe<
      { label: string | null; views: bigint; visitors: bigint }[]
    >(
      `SELECT \`${column}\` AS label, COUNT(*) AS views, COUNT(DISTINCT visitorHash) AS visitors
       FROM PageView
       WHERE createdAt >= ? AND \`${column}\` IS NOT NULL
       GROUP BY \`${column}\` ORDER BY views DESC LIMIT ${Math.floor(limit)}`,
      since,
    );
    return rows.map((r) => ({
      label: r.label ?? 'unknown',
      views: Number(r.views),
      visitors: Number(r.visitors),
    }));
  }

  /** Retention: drop rows past the window. Called by a daily cron. */
  async pruneOldViews(): Promise<number> {
    const cutoff = new Date(Date.now() - PAGEVIEW_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const { count } = await this.prisma.pageView.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (count > 0) this.logger.log(`Pruned ${count} page view(s) older than ${PAGEVIEW_RETENTION_DAYS} days`);
    return count;
  }
}

function pctChange(before: number, after: number): number | null {
  if (before === 0) return after === 0 ? 0 : null; // null = "no baseline", not "0% change"
  return Number((((after - before) / before) * 100).toFixed(1));
}
