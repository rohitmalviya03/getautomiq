import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { LinksService } from './links.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/app-config.service';

const ORG = 'org-1';

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    trackedLink: {
      create: jest.fn().mockImplementation(({ data }) => ({
        id: 'link-1',
        clickCount: 0,
        uniqueClickCount: 0,
        isActive: true,
        title: null,
        instagramAccountId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      })),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    linkClick: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    instagramAccount: { findFirst: jest.fn().mockResolvedValue({ id: 'acc-1' }) },
    ...prismaOverrides,
  } as unknown as PrismaService;
  const config = { webAppUrl: 'https://app.test/' } as unknown as AppConfigService;
  return { service: new LinksService(prisma, config), prisma };
}

describe('LinksService', () => {
  describe('create', () => {
    it('generates a slug and returns a short URL built from webAppUrl', async () => {
      const { service } = makeService();
      const view = await service.create(ORG, 'user-1', {
        destinationUrl: 'https://store.com/sale',
      });
      expect(view.slug).toMatch(/^[a-zA-Z0-9]{7}$/);
      expect(view.shortUrl).toBe(`https://app.test/api/l/${view.slug}`);
      expect(view.destinationUrl).toBe('https://store.com/sale');
    });

    it('honors a custom slug when it is free', async () => {
      const { service } = makeService();
      const view = await service.create(ORG, 'user-1', {
        destinationUrl: 'https://store.com/sale',
        slug: 'summer',
      });
      expect(view.slug).toBe('summer');
    });

    it('rejects a custom slug that is already taken', async () => {
      const { service } = makeService({
        trackedLink: {
          findUnique: jest.fn().mockResolvedValue({ id: 'existing' }),
          create: jest.fn(),
        },
      });
      await expect(
        service.create(ORG, 'user-1', { destinationUrl: 'https://x.com', slug: 'taken' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a reserved slug', async () => {
      const { service } = makeService();
      await expect(
        service.create(ORG, 'user-1', { destinationUrl: 'https://x.com', slug: 'api' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('recordClickAndResolve', () => {
    it('returns null for an unknown slug and records nothing', async () => {
      const { service, prisma } = makeService();
      const result = await service.recordClickAndResolve('nope', {});
      expect(result).toBeNull();
      expect(prisma.linkClick.create).not.toHaveBeenCalled();
    });

    it('records a click, bumps unique for a first-time visitor, and returns the destination', async () => {
      const { service, prisma } = makeService({
        trackedLink: {
          findFirst: jest.fn().mockResolvedValue({ id: 'link-1', destinationUrl: 'https://d.com' }),
          update: jest.fn().mockResolvedValue({}),
        },
        linkClick: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({}) },
      });
      const dest = await service.recordClickAndResolve('summer', {
        ip: '1.2.3.4',
        userAgent: 'Mozilla',
      });
      expect(dest).toBe('https://d.com');
      expect(prisma.linkClick.create).toHaveBeenCalled();
      expect(prisma.trackedLink.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clickCount: { increment: 1 },
            uniqueClickCount: { increment: 1 },
          }),
        }),
      );
    });

    it('does not bump unique for a repeat visitor', async () => {
      const { service, prisma } = makeService({
        trackedLink: {
          findFirst: jest.fn().mockResolvedValue({ id: 'link-1', destinationUrl: 'https://d.com' }),
          update: jest.fn().mockResolvedValue({}),
        },
        linkClick: { count: jest.fn().mockResolvedValue(3), create: jest.fn().mockResolvedValue({}) },
      });
      await service.recordClickAndResolve('summer', { ip: '1.2.3.4', userAgent: 'Mozilla' });
      const updateArg = (prisma.trackedLink.update as jest.Mock).mock.calls[0][0];
      expect(updateArg.data.clickCount).toEqual({ increment: 1 });
      expect(updateArg.data.uniqueClickCount).toBeUndefined();
    });
  });

  describe('findById', () => {
    it('throws NotFound when the link is not in the org', async () => {
      const { service } = makeService();
      await expect(service.findById(ORG, 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
