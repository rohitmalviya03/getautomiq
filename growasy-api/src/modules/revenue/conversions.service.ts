import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConversionSource, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RecordConversionDto } from './dto/record-conversion.dto';

/**
 * How far back a DM can have been sent and still be credited with a sale.
 * Someone who bought today because of a DM they got four months ago is not a
 * conversion we can honestly claim, and counting it would inflate every
 * automation's numbers with coincidence.
 */
const ATTRIBUTION_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

interface Attribution {
  contactId: string | null;
  ruleId: string | null;
  mediaId: string | null;
  variantId: string | null;
  trackedLinkId: string | null;
  matchedBy: 'email' | 'contact' | 'link' | 'none';
}

@Injectable()
export class ConversionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records a sale and freezes its attribution. Safe to call twice with the same
   * `externalId` — the second call returns the first row rather than booking the
   * revenue again, because storefront webhooks retry.
   */
  async record(organizationId: string, source: ConversionSource, dto: RecordConversionDto) {
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException('occurredAt is not a valid date');
    }

    const externalId = dto.externalId?.trim() || null;
    if (externalId) {
      const existing = await this.prisma.conversion.findFirst({
        where: { organizationId, externalId },
      });
      if (existing) return { ...this.toDto(existing), duplicate: true };
    }

    const attribution = await this.resolveAttribution(organizationId, dto, occurredAt);

    try {
      const created = await this.prisma.conversion.create({
        data: {
          organizationId,
          source,
          externalId,
          value: dto.value,
          currency: (dto.currency ?? 'INR').toUpperCase(),
          buyerEmail: dto.email?.trim().toLowerCase() ?? null,
          occurredAt,
          ...attribution,
        },
      });
      return { ...this.toDto(created), duplicate: false };
    } catch (error) {
      // Two retries of the same webhook can race past the check above; the
      // unique index is what actually guarantees we book the sale once.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        externalId
      ) {
        const existing = await this.prisma.conversion.findFirst({
          where: { organizationId, externalId },
        });
        if (existing) return { ...this.toDto(existing), duplicate: true };
      }
      throw error;
    }
  }

  /**
   * Works out which automation, post and message variant to credit.
   *
   * Last touch wins: the most recent DM this buyer received before they bought.
   * It is the only model we can defend with the data we have — Automiq sees the
   * conversation, not the browsing that happened afterwards.
   */
  private async resolveAttribution(
    organizationId: string,
    dto: RecordConversionDto,
    occurredAt: Date,
  ): Promise<Attribution> {
    const empty: Attribution = {
      contactId: null,
      ruleId: null,
      mediaId: null,
      variantId: null,
      trackedLinkId: null,
      matchedBy: 'none',
    };

    let matchedBy: Attribution['matchedBy'] = 'none';
    let contact: { id: string; instagramAccountId: string; instagramScopedId: string } | null = null;

    if (dto.contactId) {
      contact = await this.prisma.contact.findFirst({
        where: { id: dto.contactId, organizationId, deletedAt: null },
        select: { id: true, instagramAccountId: true, instagramScopedId: true },
      });
      if (contact) matchedBy = 'contact';
    }

    if (!contact && dto.email) {
      contact = await this.prisma.contact.findFirst({
        where: { organizationId, email: dto.email.trim().toLowerCase(), deletedAt: null },
        // If the same address somehow sits on two contacts, the one we spoke to
        // most recently is the one that plausibly drove the sale.
        orderBy: { lastInteractionAt: 'desc' },
        select: { id: true, instagramAccountId: true, instagramScopedId: true },
      });
      if (contact) matchedBy = 'email';
    }

    let trackedLinkId: string | null = null;
    if (dto.linkSlug) {
      const link = await this.prisma.trackedLink.findFirst({
        where: { slug: dto.linkSlug, organizationId, deletedAt: null },
        select: { id: true },
      });
      trackedLinkId = link?.id ?? null;
      if (trackedLinkId && matchedBy === 'none') matchedBy = 'link';
    }

    if (!contact) {
      return { ...empty, trackedLinkId, matchedBy };
    }

    const touch = await this.prisma.processedComment.findFirst({
      where: {
        instagramAccountId: contact.instagramAccountId,
        commenterId: contact.instagramScopedId,
        dmSent: true,
        createdAt: {
          gte: new Date(occurredAt.getTime() - ATTRIBUTION_WINDOW_DAYS * DAY_MS),
          // A DM sent after the sale cannot have caused it.
          lte: occurredAt,
        },
      },
      orderBy: { createdAt: 'desc' },
      select: { ruleId: true, mediaId: true, variantId: true },
    });

    return {
      contactId: contact.id,
      ruleId: touch?.ruleId ?? null,
      mediaId: touch?.mediaId ?? null,
      variantId: touch?.variantId ?? null,
      trackedLinkId,
      matchedBy,
    };
  }

  /** Marks an existing contact as having bought — the no-integration path. */
  async recordManual(
    organizationId: string,
    contactId: string,
    dto: Omit<RecordConversionDto, 'contactId'>,
  ) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!contact) throw new NotFoundException('Contact not found');

    return this.record(organizationId, ConversionSource.MANUAL, { ...dto, contactId });
  }

  async remove(organizationId: string, id: string) {
    const existing = await this.prisma.conversion.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Conversion not found');

    await this.prisma.conversion.delete({ where: { id } });
    return { deleted: true };
  }

  async list(organizationId: string, limit = 25) {
    const rows = await this.prisma.conversion.findMany({
      where: { organizationId },
      orderBy: { occurredAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      include: {
        rule: { select: { id: true, name: true } },
        contact: { select: { id: true, username: true, name: true, email: true } },
      },
    });

    return {
      items: rows.map((row) => ({
        ...this.toDto(row),
        ruleName: row.rule?.name ?? null,
        contact: row.contact
          ? {
              id: row.contact.id,
              username: row.contact.username,
              name: row.contact.name,
              email: row.contact.email,
            }
          : null,
      })),
    };
  }

  /**
   * Revenue broken down by what earned it. Automations with no sales are left
   * out — a table of zeroes buries the two rows that matter.
   */
  async report(organizationId: string, days: number) {
    const since = new Date(Date.now() - days * DAY_MS);
    const where = { organizationId, occurredAt: { gte: since } };

    const [totals, attributed, byRuleRaw, byPostRaw, byVariantRaw, latest] = await Promise.all([
      this.prisma.conversion.aggregate({ where, _sum: { value: true }, _count: true }),
      this.prisma.conversion.aggregate({
        where: { ...where, ruleId: { not: null } },
        _sum: { value: true },
        _count: true,
      }),
      this.prisma.conversion.groupBy({
        by: ['ruleId'],
        where: { ...where, ruleId: { not: null } },
        _sum: { value: true },
        _count: { _all: true },
      }),
      this.prisma.conversion.groupBy({
        by: ['mediaId'],
        where: { ...where, mediaId: { not: null } },
        _sum: { value: true },
        _count: { _all: true },
      }),
      this.prisma.conversion.groupBy({
        by: ['ruleId', 'variantId'],
        where: { ...where, variantId: { not: null } },
        _sum: { value: true },
        _count: { _all: true },
      }),
      this.prisma.conversion.findFirst({
        where: { organizationId },
        orderBy: { occurredAt: 'desc' },
        select: { currency: true },
      }),
    ]);

    const ruleIds = byRuleRaw.map((r) => r.ruleId).filter((id): id is string => Boolean(id));
    const rules = ruleIds.length
      ? await this.prisma.automationRule.findMany({
          where: { id: { in: ruleIds } },
          select: { id: true, name: true },
        })
      : [];
    const ruleNames = new Map(rules.map((r) => [r.id, r.name]));

    const byRule = byRuleRaw
      .map((row) => ({
        ruleId: row.ruleId as string,
        // A deleted rule still owns the revenue it earned while it ran.
        ruleName: ruleNames.get(row.ruleId as string) ?? 'Deleted automation',
        conversions: row._count._all,
        revenue: row._sum.value ?? 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const byPost = byPostRaw
      .map((row) => ({
        mediaId: row.mediaId as string,
        conversions: row._count._all,
        revenue: row._sum.value ?? 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const byVariant = byVariantRaw
      .map((row) => ({
        ruleId: row.ruleId,
        ruleName: row.ruleId ? (ruleNames.get(row.ruleId) ?? 'Deleted automation') : null,
        variantId: row.variantId as string,
        conversions: row._count._all,
        revenue: row._sum.value ?? 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const totalRevenue = totals._sum.value ?? 0;
    const attributedRevenue = attributed._sum.value ?? 0;

    return {
      days,
      currency: latest?.currency ?? 'INR',
      totalRevenue,
      totalConversions: totals._count,
      attributedRevenue,
      attributedConversions: attributed._count,
      /** Revenue we could trace to an automation, as a share of everything reported. */
      unattributedRevenue: totalRevenue - attributedRevenue,
      byRule,
      byPost,
      byVariant,
    };
  }

  private toDto(row: {
    id: string;
    source: ConversionSource;
    externalId: string | null;
    value: number;
    currency: string;
    buyerEmail: string | null;
    contactId: string | null;
    ruleId: string | null;
    mediaId: string | null;
    variantId: string | null;
    trackedLinkId: string | null;
    matchedBy: string;
    occurredAt: Date;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      source: row.source,
      externalId: row.externalId,
      value: row.value,
      currency: row.currency,
      buyerEmail: row.buyerEmail,
      contactId: row.contactId,
      ruleId: row.ruleId,
      mediaId: row.mediaId,
      variantId: row.variantId,
      trackedLinkId: row.trackedLinkId,
      matchedBy: row.matchedBy,
      occurredAt: row.occurredAt,
      createdAt: row.createdAt,
    };
  }
}
