import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { InstagramAccountsService } from './instagram-accounts.service';
import { MetaGraphService } from './meta-graph.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { TokenEncryptionService } from '../../common/services/token-encryption.service';
import { PlanLimitsService } from '../billing/plan-limits.service';

const ORG = 'org-1';
const USER = 'user-1';

const PROFILE = {
  id: 'ig-user-123',
  username: 'myshop',
  name: 'My Shop',
  profilePictureUrl: 'https://cdn.example/pic.jpg',
  followersCount: 100,
  mediaCount: 10,
};

describe('InstagramAccountsService', () => {
  let service: InstagramAccountsService;
  let tokenEncryption: TokenEncryptionService;
  let metaGraph: {
    assertConfigured: jest.Mock;
    buildAuthorizationUrl: jest.Mock;
    exchangeCodeForToken: jest.Mock;
    exchangeForLongLivedToken: jest.Mock;
    getProfile: jest.Mock;
  };
  let prisma: {
    instagramAccount: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    automationRule: { updateMany: jest.Mock };
    subscription: { findUnique: jest.Mock };
  };

  const appConfig = {
    encryptionKey: randomBytes(32).toString('hex'),
    jwt: { accessSecret: 'a'.repeat(32) },
    meta: { oauthScopes: 'instagram_business_basic,instagram_business_manage_messages' },
  } as unknown as AppConfigService;

  beforeEach(async () => {
    metaGraph = {
      assertConfigured: jest.fn(),
      buildAuthorizationUrl: jest
        .fn()
        .mockReturnValue('https://www.instagram.com/oauth/authorize?...'),
      exchangeCodeForToken: jest
        .fn()
        .mockResolvedValue({ accessToken: 'SHORT', userId: 'ig-user-123' }),
      exchangeForLongLivedToken: jest
        .fn()
        .mockResolvedValue({ accessToken: 'LONG', expiresIn: 5184000 }),
      getProfile: jest.fn().mockResolvedValue(PROFILE),
    };
    prisma = {
      instagramAccount: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }: any) => Promise.resolve({ id: 'acc-1', ...data })),
        upsert: jest
          .fn()
          .mockImplementation(({ create }: any) => Promise.resolve({ id: 'acc-1', ...create })),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      automationRule: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      subscription: { findUnique: jest.fn().mockResolvedValue(null) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        InstagramAccountsService,
        { provide: PrismaService, useValue: prisma },
        { provide: MetaGraphService, useValue: metaGraph },
        { provide: JwtService, useValue: new JwtService({}) },
        { provide: AppConfigService, useValue: appConfig },
        { provide: TokenEncryptionService, useValue: new TokenEncryptionService(appConfig) },
        // Real service over the mock prisma so the account-limit path is exercised end-to-end.
        {
          provide: PlanLimitsService,
          useValue: new PlanLimitsService(prisma as unknown as PrismaService),
        },
      ],
    }).compile();

    service = moduleRef.get(InstagramAccountsService);
    tokenEncryption = moduleRef.get(TokenEncryptionService);
  });

  function validState(org = ORG, user = USER): string {
    return service.getAuthorizationUrl(org, user).state;
  }

  describe('getAuthorizationUrl', () => {
    it('returns the Instagram authorize URL and a signed state', () => {
      const result = service.getAuthorizationUrl(ORG, USER);
      expect(result.url).toContain('instagram.com/oauth/authorize');
      expect(result.state).toEqual(expect.any(String));
      expect(metaGraph.buildAuthorizationUrl).toHaveBeenCalledWith(result.state);
    });
  });

  describe('handleOAuthCallback', () => {
    it('runs the full exchange and upserts one account with an encrypted long-lived token', async () => {
      const state = validState();
      const account = await service.handleOAuthCallback(ORG, USER, 'the-code', state);

      expect(metaGraph.exchangeCodeForToken).toHaveBeenCalledWith('the-code');
      expect(metaGraph.exchangeForLongLivedToken).toHaveBeenCalledWith('SHORT');
      expect(metaGraph.getProfile).toHaveBeenCalledWith('LONG');

      const upsertArgs = prisma.instagramAccount.upsert.mock.calls[0][0];
      expect(upsertArgs.where).toEqual({ instagramBusinessId: 'ig-user-123' });
      expect(upsertArgs.create.instagramBusinessId).toBe('ig-user-123');
      expect(upsertArgs.create.facebookPageId).toBeNull();
      expect(upsertArgs.create.accessTokenEncrypted).not.toContain('LONG');
      expect(tokenEncryption.decrypt(upsertArgs.create.accessTokenEncrypted)).toBe('LONG');
      // ~60 day expiry recorded, and the update path refreshes the token too
      expect(upsertArgs.create.tokenExpiresAt).toBeInstanceOf(Date);
      expect(tokenEncryption.decrypt(upsertArgs.update.accessTokenEncrypted)).toBe('LONG');
      expect(upsertArgs.update.status).toBe('CONNECTED');
      expect(account.username).toBe('myshop');
    });

    it('reconnects an existing account (same IG identity) without a duplicate row', async () => {
      prisma.instagramAccount.findFirst.mockResolvedValue({
        id: 'acc-existing',
        organizationId: ORG,
        instagramBusinessId: 'ig-user-123',
      });
      const state = service.getAuthorizationUrl(ORG, USER, 'acc-existing').state;

      await service.handleOAuthCallback(ORG, USER, 'code', state);

      // No plan-limit check for an existing account, and it upserts (updates) it.
      expect(prisma.instagramAccount.upsert).toHaveBeenCalled();
    });

    it('rejects a reconnect that returns a different Instagram account', async () => {
      prisma.instagramAccount.findFirst.mockResolvedValue({
        id: 'acc-existing',
        organizationId: ORG,
        instagramBusinessId: 'ig-user-123',
      });
      // State asks to reconnect a DIFFERENT account than the one that authorized.
      const state = service.getAuthorizationUrl(ORG, USER, 'some-other-account').state;

      await expect(service.handleOAuthCallback(ORG, USER, 'code', state)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a state issued for a different organization', async () => {
      const state = validState('other-org', USER);
      await expect(service.handleOAuthCallback(ORG, USER, 'code', state)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects garbage state', async () => {
      await expect(
        service.handleOAuthCallback(ORG, USER, 'code', 'not-a-jwt'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an account LIVE in another workspace with 409', async () => {
      prisma.instagramAccount.findFirst.mockResolvedValue({
        id: 'existing',
        organizationId: 'other-org',
        instagramBusinessId: 'ig-user-123',
        deletedAt: null,
      });
      await expect(
        service.handleOAuthCallback(ORG, USER, 'code', validState()),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('re-claims an account that was REMOVED from another workspace', async () => {
      // Soft-deleted row still holds the globally-unique instagramBusinessId.
      prisma.instagramAccount.findFirst.mockResolvedValue({
        id: 'freed-acc',
        organizationId: 'other-org',
        instagramBusinessId: 'ig-user-123',
        deletedAt: new Date(),
      });

      await service.handleOAuthCallback(ORG, USER, 'code', validState());

      // The upsert claims the row for the connecting org and un-deletes it...
      const upsertArgs = prisma.instagramAccount.upsert.mock.calls[0][0];
      expect(upsertArgs.update.organizationId).toBe(ORG);
      expect(upsertArgs.update.deletedAt).toBeNull();
      // ...and the old workspace's now-dead rules for it are archived.
      expect(prisma.automationRule.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ instagramAccountId: 'freed-acc' }),
          data: expect.objectContaining({ status: 'ARCHIVED' }),
        }),
      );
    });

    it('enforces the plan limit for a brand-new connection', async () => {
      // No existing account → this is a new connect and counts against the plan.
      prisma.instagramAccount.findFirst.mockResolvedValue(null);
      prisma.subscription.findUnique.mockResolvedValue({
        planId: 'plan-1',
        plan: { name: 'Starter', limits: JSON.stringify({ maxInstagramAccounts: 1 }) },
      });
      prisma.instagramAccount.count.mockResolvedValue(1);

      await expect(
        service.handleOAuthCallback(ORG, USER, 'code', validState()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.instagramAccount.upsert).not.toHaveBeenCalled();
    });

    it('treats -1 in plan limits as unlimited', async () => {
      prisma.subscription.findUnique.mockResolvedValue({
        planId: 'plan-ent',
        plan: { name: 'Enterprise', limits: JSON.stringify({ maxInstagramAccounts: -1 }) },
      });
      prisma.instagramAccount.count.mockResolvedValue(999);

      await expect(
        service.handleOAuthCallback(ORG, USER, 'code', validState()),
      ).resolves.toBeDefined();
    });
  });

  describe('syncProfile', () => {
    it('updates profile fields from the Instagram Graph API', async () => {
      const encrypted = tokenEncryption.encrypt('LONG');
      prisma.instagramAccount.findFirst.mockResolvedValue({
        id: 'acc-1',
        organizationId: ORG,
        instagramBusinessId: 'ig-user-123',
        accessTokenEncrypted: encrypted,
      });
      metaGraph.getProfile.mockResolvedValue({ ...PROFILE, username: 'renamed' });
      prisma.instagramAccount.update.mockResolvedValue({ id: 'acc-1', username: 'renamed' });

      await service.syncProfile(ORG, 'acc-1');

      expect(metaGraph.getProfile).toHaveBeenCalledWith('LONG');
      expect(prisma.instagramAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ username: 'renamed', status: 'CONNECTED' }),
        }),
      );
    });

    it('marks the account ERROR when the Graph call fails (dead token)', async () => {
      const encrypted = tokenEncryption.encrypt('DEAD');
      prisma.instagramAccount.findFirst.mockResolvedValue({
        id: 'acc-1',
        organizationId: ORG,
        instagramBusinessId: 'ig-user-123',
        accessTokenEncrypted: encrypted,
      });
      metaGraph.getProfile.mockRejectedValue(new Error('token expired'));
      prisma.instagramAccount.update.mockResolvedValue({});

      await expect(service.syncProfile(ORG, 'acc-1')).rejects.toThrow('token expired');
      expect(prisma.instagramAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'ERROR' } }),
      );
    });
  });

  describe('disconnect', () => {
    it('soft-deletes and marks DISCONNECTED', async () => {
      prisma.instagramAccount.findFirst.mockResolvedValue({ id: 'acc-1', organizationId: ORG });
      prisma.instagramAccount.update.mockResolvedValue({});

      await service.disconnect(ORG, 'acc-1');

      expect(prisma.instagramAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'DISCONNECTED', deletedAt: expect.any(Date) }),
        }),
      );
    });
  });
});
