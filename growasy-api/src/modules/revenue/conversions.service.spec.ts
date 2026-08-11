import { NotFoundException } from '@nestjs/common';
import { ConversionsService } from './conversions.service';
import { PrismaService } from '../../prisma/prisma.service';

const ORG = 'org-1';

const CONTACT = {
  id: 'contact-1',
  instagramAccountId: 'acc-1',
  instagramScopedId: 'igsid-9',
};

const TOUCH = { ruleId: 'rule-1', mediaId: 'media-7', variantId: 'B' };

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    conversion: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => ({
        id: 'conv-1',
        createdAt: new Date(),
        ...data,
      })),
      delete: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _sum: { value: 0 }, _count: 0 }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    contact: { findFirst: jest.fn().mockResolvedValue(null) },
    trackedLink: { findFirst: jest.fn().mockResolvedValue(null) },
    processedComment: { findFirst: jest.fn().mockResolvedValue(null) },
    automationRule: { findMany: jest.fn().mockResolvedValue([]) },
    ...prismaOverrides,
  } as unknown as PrismaService;
  return { service: new ConversionsService(prisma), prisma };
}

describe('ConversionsService', () => {
  describe('attribution', () => {
    it('credits the last DM the buyer received before they bought', async () => {
      const { service, prisma } = makeService({
        contact: { findFirst: jest.fn().mockResolvedValue(CONTACT) },
        processedComment: { findFirst: jest.fn().mockResolvedValue(TOUCH) },
      });

      const result = await service.record(ORG, 'API', {
        value: 49900,
        email: 'buyer@example.com',
      });

      expect(result).toMatchObject({
        contactId: 'contact-1',
        ruleId: 'rule-1',
        mediaId: 'media-7',
        variantId: 'B',
        matchedBy: 'email',
      });
      // Ordered newest-first: last touch, not first.
      expect(
        (prisma.processedComment.findFirst as jest.Mock).mock.calls[0][0].orderBy,
      ).toEqual({ createdAt: 'desc' });
    });

    it('ignores DMs sent after the sale — they cannot have caused it', async () => {
      const { service, prisma } = makeService({
        contact: { findFirst: jest.fn().mockResolvedValue(CONTACT) },
      });

      const occurredAt = '2026-06-01T00:00:00.000Z';
      await service.record(ORG, 'API', { value: 1000, email: 'b@example.com', occurredAt });

      const where = (prisma.processedComment.findFirst as jest.Mock).mock.calls[0][0].where;
      expect(where.createdAt.lte).toEqual(new Date(occurredAt));
      // 30-day window before the sale.
      expect(where.createdAt.gte).toEqual(new Date('2026-05-02T00:00:00.000Z'));
    });

    it('records the sale as unattributed when the email matches no contact', async () => {
      const { service, prisma } = makeService();

      const result = await service.record(ORG, 'API', {
        value: 25000,
        email: 'stranger@example.com',
      });

      expect(result).toMatchObject({ contactId: null, ruleId: null, matchedBy: 'none' });
      // No contact means nothing to look a DM up by.
      expect(prisma.processedComment.findFirst).not.toHaveBeenCalled();
    });

    it('falls back to the tracked link when there is no contact', async () => {
      const { service } = makeService({
        trackedLink: { findFirst: jest.fn().mockResolvedValue({ id: 'link-3' }) },
      });

      const result = await service.record(ORG, 'API', { value: 1000, linkSlug: 'abc123' });

      expect(result).toMatchObject({ trackedLinkId: 'link-3', matchedBy: 'link' });
    });

    it('prefers an explicit contactId over the email lookup', async () => {
      const contactFindFirst = jest.fn().mockResolvedValue(CONTACT);
      const { service } = makeService({
        contact: { findFirst: contactFindFirst },
        processedComment: { findFirst: jest.fn().mockResolvedValue(TOUCH) },
      });

      const result = await service.record(ORG, 'API', {
        value: 1000,
        contactId: 'contact-1',
        email: 'someone-else@example.com',
      });

      expect(result.matchedBy).toBe('contact');
      expect(contactFindFirst).toHaveBeenCalledTimes(1);
    });

    it('never resolves a contact from another organization', async () => {
      const contactFindFirst = jest.fn().mockResolvedValue(null);
      const { service } = makeService({ contact: { findFirst: contactFindFirst } });

      await service.record(ORG, 'API', { value: 1000, contactId: 'contact-from-elsewhere' });

      expect(contactFindFirst.mock.calls[0][0].where).toMatchObject({ organizationId: ORG });
    });
  });

  describe('idempotency', () => {
    it('does not book the same order twice', async () => {
      const existing = {
        id: 'conv-1',
        source: 'API',
        externalId: 'order-99',
        value: 49900,
        currency: 'INR',
        buyerEmail: null,
        contactId: null,
        ruleId: null,
        mediaId: null,
        variantId: null,
        trackedLinkId: null,
        matchedBy: 'none',
        occurredAt: new Date(),
        createdAt: new Date(),
      };
      const { service, prisma } = makeService({
        conversion: {
          findFirst: jest.fn().mockResolvedValue(existing),
          create: jest.fn(),
        },
      });

      const result = await service.record(ORG, 'API', { value: 49900, externalId: 'order-99' });

      expect(result).toMatchObject({ id: 'conv-1', duplicate: true });
      expect(prisma.conversion.create).not.toHaveBeenCalled();
    });

    it('books a sale with no order id every time it is reported', async () => {
      const { service, prisma } = makeService();

      const result = await service.record(ORG, 'MANUAL', { value: 1000, contactId: 'contact-1' });

      expect(result.duplicate).toBe(false);
      expect(prisma.conversion.create).toHaveBeenCalledTimes(1);
      expect((prisma.conversion.create as jest.Mock).mock.calls[0][0].data.externalId).toBeNull();
    });
  });

  describe('recordManual', () => {
    it('rejects a contact that is not in the organization', async () => {
      const { service } = makeService();

      await expect(service.recordManual(ORG, 'contact-x', { value: 500 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('marks the conversion as manually entered', async () => {
      const { service, prisma } = makeService({
        contact: { findFirst: jest.fn().mockResolvedValue(CONTACT) },
        processedComment: { findFirst: jest.fn().mockResolvedValue(TOUCH) },
      });

      await service.recordManual(ORG, 'contact-1', { value: 500 });

      expect((prisma.conversion.create as jest.Mock).mock.calls[0][0].data).toMatchObject({
        source: 'MANUAL',
        ruleId: 'rule-1',
      });
    });
  });

  describe('report', () => {
    it('separates revenue it could trace from revenue it could not', async () => {
      const aggregate = jest
        .fn()
        .mockResolvedValueOnce({ _sum: { value: 100_000 }, _count: 5 })
        .mockResolvedValueOnce({ _sum: { value: 60_000 }, _count: 3 });
      const { service } = makeService({
        conversion: {
          aggregate,
          groupBy: jest.fn().mockResolvedValue([]),
          findFirst: jest.fn().mockResolvedValue({ currency: 'INR' }),
        },
      });

      const report = await service.report(ORG, 30);

      expect(report).toMatchObject({
        totalRevenue: 100_000,
        attributedRevenue: 60_000,
        unattributedRevenue: 40_000,
        totalConversions: 5,
        attributedConversions: 3,
      });
    });

    it('still names revenue earned by an automation that was since deleted', async () => {
      const { service } = makeService({
        conversion: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { value: 0 }, _count: 0 }),
          groupBy: jest
            .fn()
            .mockResolvedValueOnce([
              { ruleId: 'rule-gone', _sum: { value: 7000 }, _count: { _all: 2 } },
            ])
            .mockResolvedValue([]),
          findFirst: jest.fn().mockResolvedValue(null),
        },
        automationRule: { findMany: jest.fn().mockResolvedValue([]) },
      });

      const report = await service.report(ORG, 30);

      expect(report.byRule).toEqual([
        { ruleId: 'rule-gone', ruleName: 'Deleted automation', conversions: 2, revenue: 7000 },
      ]);
      expect(report.currency).toBe('INR');
    });
  });
});
