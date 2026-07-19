import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { type TrackedLink } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { CreateLinkDto } from './dto/create-link.dto';
import { UpdateLinkDto } from './dto/update-link.dto';

const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const GENERATED_SLUG_LENGTH = 7;
const MAX_SLUG_ATTEMPTS = 5;
const DEFAULT_STATS_DAYS = 30;

@Injectable()
export class LinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async create(organizationId: string, userId: string | undefined, dto: CreateLinkDto) {
    if (dto.instagramAccountId) {
      await this.assertAccountInOrg(organizationId, dto.instagramAccountId);
    }

    const slug = dto.slug ? await this.reserveCustomSlug(dto.slug) : await this.generateUniqueSlug();

    const link = await this.prisma.trackedLink.create({
      data: {
        organizationId,
        instagramAccountId: dto.instagramAccountId ?? null,
        createdByUserId: userId ?? null,
        slug,
        destinationUrl: dto.destinationUrl,
        title: dto.title ?? null,
      },
    });
    return this.toView(link);
  }

  async list(organizationId: string, instagramAccountId?: string) {
    const links = await this.prisma.trackedLink.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(instagramAccountId ? { instagramAccountId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return links.map((link) => this.toView(link));
  }

  async findById(organizationId: string, id: string) {
    return this.toView(await this.getOwned(organizationId, id));
  }

  async update(organizationId: string, id: string, dto: UpdateLinkDto) {
    await this.getOwned(organizationId, id);
    const link = await this.prisma.trackedLink.update({
      where: { id },
      data: {
        destinationUrl: dto.destinationUrl ?? undefined,
        title: dto.title ?? undefined,
        isActive: dto.isActive ?? undefined,
      },
    });
    return this.toView(link);
  }

  async remove(organizationId: string, id: string) {
    await this.getOwned(organizationId, id);
    await this.prisma.trackedLink.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  /**
   * Per-link click analytics: running totals plus a daily click series and the
   * top referrers over the window. Clicks are bucketed by day in JS (MySQL 5.6
   * has no convenient date_trunc through Prisma).
   */
  async stats(organizationId: string, id: string, days = DEFAULT_STATS_DAYS) {
    const link = await this.getOwned(organizationId, id);
    const windowDays = Math.min(Math.max(days, 1), 90);
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const clicks = await this.prisma.linkClick.findMany({
      where: { trackedLinkId: id, createdAt: { gte: since } },
      select: { createdAt: true, referrer: true },
      orderBy: { createdAt: 'asc' },
    });

    const byDay = new Map<string, number>();
    for (let i = 0; i < windowDays; i++) {
      const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
      byDay.set(d.toISOString().slice(0, 10), 0);
    }
    const referrerCounts = new Map<string, number>();
    for (const click of clicks) {
      const day = click.createdAt.toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
      const ref = normalizeReferrer(click.referrer);
      referrerCounts.set(ref, (referrerCounts.get(ref) ?? 0) + 1);
    }

    return {
      ...this.toView(link),
      rangeDays: windowDays,
      clicksInRange: clicks.length,
      clicksPerDay: Array.from(byDay.entries()).map(([date, count]) => ({ date, count })),
      topReferrers: Array.from(referrerCounts.entries())
        .map(([referrer, count]) => ({ referrer, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
    };
  }

  /**
   * Public redirect path: resolves an active link by slug, records the click
   * (every hit; unique count bumped only for a first-time visitor hash), and
   * returns the destination. Returns null when the slug is unknown/paused so the
   * controller can 404. Never throws on a tracking failure — the redirect wins.
   */
  async recordClickAndResolve(
    slug: string,
    meta: { ip?: string | null; userAgent?: string | null; referrer?: string | null },
  ): Promise<string | null> {
    const link = await this.prisma.trackedLink.findFirst({
      where: { slug, deletedAt: null, isActive: true },
      select: { id: true, destinationUrl: true },
    });
    if (!link) return null;

    try {
      const visitorHash = createHash('sha256')
        .update(`${link.id}:${meta.ip ?? ''}:${meta.userAgent ?? ''}`)
        .digest('hex');
      const priorFromVisitor = await this.prisma.linkClick.count({
        where: { trackedLinkId: link.id, visitorHash },
      });
      await this.prisma.linkClick.create({
        data: {
          trackedLinkId: link.id,
          visitorHash,
          referrer: meta.referrer?.slice(0, 1024) ?? null,
          userAgent: meta.userAgent?.slice(0, 500) ?? null,
        },
      });
      await this.prisma.trackedLink.update({
        where: { id: link.id },
        data: {
          clickCount: { increment: 1 },
          ...(priorFromVisitor === 0 ? { uniqueClickCount: { increment: 1 } } : {}),
        },
      });
    } catch {
      // Tracking is best-effort — a DB hiccup must not break the redirect.
    }

    return link.destinationUrl;
  }

  // --- helpers ---------------------------------------------------------------

  private async getOwned(organizationId: string, id: string): Promise<TrackedLink> {
    const link = await this.prisma.trackedLink.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!link) {
      throw new NotFoundException('Link not found');
    }
    return link;
  }

  private async assertAccountInOrg(organizationId: string, instagramAccountId: string) {
    const account = await this.prisma.instagramAccount.findFirst({
      where: { id: instagramAccountId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!account) {
      throw new ForbiddenException('That Instagram account does not belong to this workspace');
    }
  }

  private async reserveCustomSlug(slug: string): Promise<string> {
    if (RESERVED_SLUGS.has(slug.toLowerCase())) {
      throw new BadRequestException('That short code is reserved — pick another');
    }
    const existing = await this.prisma.trackedLink.findUnique({ where: { slug } });
    if (existing) {
      throw new ConflictException('That short code is already taken');
    }
    return slug;
  }

  private async generateUniqueSlug(): Promise<string> {
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
      const slug = randomSlug();
      const existing = await this.prisma.trackedLink.findUnique({ where: { slug } });
      if (!existing) return slug;
    }
    throw new ConflictException('Could not allocate a unique short code — try again');
  }

  private toView(link: TrackedLink) {
    return {
      id: link.id,
      slug: link.slug,
      shortUrl: this.buildShortUrl(link.slug),
      destinationUrl: link.destinationUrl,
      title: link.title,
      instagramAccountId: link.instagramAccountId,
      clickCount: link.clickCount,
      uniqueClickCount: link.uniqueClickCount,
      isActive: link.isActive,
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
    };
  }

  private buildShortUrl(slug: string): string {
    const base = this.config.webAppUrl.replace(/\/+$/, '');
    return `${base}/api/l/${slug}`;
  }
}

/** Slugs that would collide with real app/API paths and must not be issued. */
const RESERVED_SLUGS = new Set(['api', 'l', 'admin', 'app', 'www', 'dashboard', 'login']);

function randomSlug(): string {
  const bytes = randomBytes(GENERATED_SLUG_LENGTH);
  let out = '';
  for (let i = 0; i < GENERATED_SLUG_LENGTH; i++) {
    out += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  }
  return out;
}

function normalizeReferrer(referrer: string | null): string {
  if (!referrer) return 'Direct';
  try {
    return new URL(referrer).hostname || 'Direct';
  } catch {
    return 'Direct';
  }
}
