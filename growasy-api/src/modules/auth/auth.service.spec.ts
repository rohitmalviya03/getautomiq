import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { UsersService } from '../users/users.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { MailQueueService } from '../../queues/mail-queue.service';
import { hashPassword, sha256 } from '../../common/utils/hash.util';

describe('AuthService', () => {
  let authService: AuthService;
  let prisma: {
    user: { create: jest.Mock; update: jest.Mock; findFirst: jest.Mock };
    session: {
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
    emailVerificationToken: {
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findFirst: jest.Mock;
    };
    passwordResetToken: {
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findFirst: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let usersService: { findByEmail: jest.Mock; findById: jest.Mock };
  let organizationsService: { createWithOwner: jest.Mock; listForUser: jest.Mock };
  let mailQueue: {
    sendVerificationEmail: jest.Mock;
    sendPasswordResetEmail: jest.Mock;
    sendWelcomeEmail: jest.Mock;
  };

  const baseUser = {
    id: 'user-1',
    email: 'jane@acme.com',
    firstName: 'Jane',
    lastName: 'Doe',
    isEmailVerified: false,
    status: 'PENDING_VERIFICATION',
    passwordHash: '',
    failedLoginAttempts: 0,
    lockedUntil: null as Date | null,
  };

  beforeEach(async () => {
    prisma = {
      user: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
      session: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      emailVerificationToken: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findFirst: jest.fn(),
      },
      passwordResetToken: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findFirst: jest.fn(),
      },
      $transaction: jest.fn(async (arg) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    };

    usersService = { findByEmail: jest.fn(), findById: jest.fn() };
    organizationsService = {
      createWithOwner: jest.fn(),
      listForUser: jest.fn().mockResolvedValue([]),
    };
    mailQueue = {
      sendVerificationEmail: jest.fn(),
      sendPasswordResetEmail: jest.fn(),
      sendWelcomeEmail: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: new JwtService({}) },
        {
          provide: AppConfigService,
          useValue: {
            bcryptSaltRounds: 4,
            emailVerificationTtlHours: 24,
            passwordResetTtlMinutes: 60,
            webAppUrl: 'http://localhost:5173',
            jwt: {
              accessSecret: 'a'.repeat(32),
              accessExpiresIn: '15m',
              refreshSecret: 'b'.repeat(32),
              refreshExpiresIn: '7d',
              refreshRememberExpiresIn: '30d',
            },
          },
        },
        { provide: UsersService, useValue: usersService },
        { provide: OrganizationsService, useValue: organizationsService },
        { provide: MailQueueService, useValue: mailQueue },
      ],
    }).compile();

    authService = moduleRef.get(AuthService);
  });

  describe('register', () => {
    it('throws ConflictException when the email is already taken', async () => {
      usersService.findByEmail.mockResolvedValue(baseUser);

      await expect(
        authService.register(
          { email: baseUser.email, password: 'Pass1234', firstName: 'Jane', lastName: 'Doe' },
          {},
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates the user, bootstraps an organization, sends a verification email, and issues a session', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ ...baseUser });
      organizationsService.createWithOwner.mockResolvedValue({
        id: 'org-1',
        slug: 'janes-workspace',
      });
      prisma.session.create.mockResolvedValue({ id: 'session-1' });
      prisma.session.update.mockResolvedValue({});
      prisma.emailVerificationToken.create.mockResolvedValue({});

      const result = await authService.register(
        { email: baseUser.email, password: 'Pass1234', firstName: 'Jane', lastName: 'Doe' },
        { ipAddress: '127.0.0.1', userAgent: 'jest' },
      );

      expect(organizationsService.createWithOwner).toHaveBeenCalledWith(
        expect.objectContaining({ id: baseUser.id }),
        undefined,
      );
      expect(mailQueue.sendVerificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ toEmail: baseUser.email }),
      );
      expect(result.user.organizationId).toBe('org-1');
      expect(result.tokens.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
    });
  });

  describe('validateCredentials', () => {
    it('returns null for an unknown email', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      await expect(authService.validateCredentials('nobody@acme.com', 'x')).resolves.toBeNull();
    });

    it('returns null and increments failedLoginAttempts on a wrong password', async () => {
      const passwordHash = await hashPassword('CorrectPass1', 4);
      usersService.findByEmail.mockResolvedValue({ ...baseUser, passwordHash, status: 'ACTIVE' });
      prisma.user.update.mockResolvedValue({});

      const result = await authService.validateCredentials(baseUser.email, 'WrongPass1');

      expect(result).toBeNull();
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ failedLoginAttempts: 1 }) }),
      );
    });

    it('throws ForbiddenException when the account is locked', async () => {
      usersService.findByEmail.mockResolvedValue({
        ...baseUser,
        lockedUntil: new Date(Date.now() + 60_000),
      });

      await expect(
        authService.validateCredentials(baseUser.email, 'anything'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ForbiddenException for a suspended account even with the correct password', async () => {
      const passwordHash = await hashPassword('CorrectPass1', 4);
      usersService.findByEmail.mockResolvedValue({
        ...baseUser,
        passwordHash,
        status: 'SUSPENDED',
      });

      await expect(
        authService.validateCredentials(baseUser.email, 'CorrectPass1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns the user and clears lockout state on success', async () => {
      const passwordHash = await hashPassword('CorrectPass1', 4);
      usersService.findByEmail.mockResolvedValue({
        ...baseUser,
        passwordHash,
        status: 'ACTIVE',
        failedLoginAttempts: 2,
      });
      prisma.user.update.mockResolvedValue({});

      const result = await authService.validateCredentials(baseUser.email, 'CorrectPass1');

      expect(result).toEqual(expect.objectContaining({ id: baseUser.id }));
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { failedLoginAttempts: 0, lockedUntil: null },
        }),
      );
    });
  });

  describe('refresh', () => {
    it('rejects a token whose hash does not match the stored session (reuse detection)', async () => {
      const jwt = new JwtService({});
      const refreshToken = jwt.sign(
        { sub: baseUser.id, sessionId: 'session-1' },
        { secret: 'b'.repeat(32), expiresIn: '7d' },
      );
      prisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: baseUser.id,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        refreshTokenHash: 'stale-hash-from-a-previous-rotation',
        isRememberMe: false,
      });
      prisma.session.update.mockResolvedValue({});

      await expect(authService.refresh(refreshToken, {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.session.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ revokedAt: expect.any(Date) }) }),
      );
    });

    it('rotates the refresh token and issues a new access token when everything checks out', async () => {
      const jwt = new JwtService({});
      const refreshToken = jwt.sign(
        { sub: baseUser.id, sessionId: 'session-1' },
        { secret: 'b'.repeat(32), expiresIn: '7d' },
      );
      prisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: baseUser.id,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        refreshTokenHash: sha256(refreshToken),
        isRememberMe: false,
        ipAddress: null,
        userAgent: null,
      });
      prisma.session.update.mockResolvedValue({});
      usersService.findById.mockResolvedValue({ ...baseUser, status: 'ACTIVE' });

      const result = await authService.refresh(refreshToken, { ipAddress: '1.2.3.4' });

      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).not.toBe(refreshToken);
    });
  });

  describe('forgotPassword', () => {
    it('does nothing observable when the email does not exist (no user enumeration)', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await authService.forgotPassword('nobody@acme.com', {});

      expect(mailQueue.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('issues a reset token and enqueues the email for an active user', async () => {
      usersService.findByEmail.mockResolvedValue({ ...baseUser, status: 'ACTIVE' });
      prisma.passwordResetToken.updateMany.mockResolvedValue({});
      prisma.passwordResetToken.create.mockResolvedValue({});

      await authService.forgotPassword(baseUser.email, { ipAddress: '1.2.3.4' });

      expect(mailQueue.sendPasswordResetEmail).toHaveBeenCalledWith(
        expect.objectContaining({ toEmail: baseUser.email }),
      );
    });
  });

  describe('resetPassword', () => {
    it('rejects an invalid or expired token', async () => {
      prisma.passwordResetToken.findFirst.mockResolvedValue(null);

      await expect(authService.resetPassword('bad-token', 'NewPass1234')).rejects.toThrow();
    });

    it('updates the password and revokes all sessions on success', async () => {
      prisma.passwordResetToken.findFirst.mockResolvedValue({ id: 'token-1', userId: baseUser.id });
      prisma.passwordResetToken.update.mockResolvedValue({});
      prisma.user.update.mockResolvedValue({});
      prisma.session.updateMany.mockResolvedValue({});

      await authService.resetPassword('good-token', 'NewPass1234');

      expect(prisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: baseUser.id, revokedAt: null },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });
  });

  describe('verifyEmail', () => {
    it('rejects an invalid or expired token', async () => {
      prisma.emailVerificationToken.findFirst.mockResolvedValue(null);

      await expect(authService.verifyEmail('bad-token')).rejects.toThrow();
    });

    it('marks the user verified and active, then sends a welcome email', async () => {
      prisma.emailVerificationToken.findFirst.mockResolvedValue({
        id: 'evt-1',
        userId: baseUser.id,
      });
      prisma.emailVerificationToken.update.mockResolvedValue({});
      prisma.user.update.mockResolvedValue({});
      usersService.findById.mockResolvedValue({
        ...baseUser,
        isEmailVerified: true,
        status: 'ACTIVE',
      });

      await authService.verifyEmail('good-token');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isEmailVerified: true, status: 'ACTIVE' },
        }),
      );
      expect(mailQueue.sendWelcomeEmail).toHaveBeenCalledWith(
        expect.objectContaining({ toEmail: baseUser.email }),
      );
    });
  });
});
