import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { UsersService } from '../users/users.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { MailQueueService } from '../../queues/mail-queue.service';
import {
  generateOpaqueToken,
  hashPassword,
  sha256,
  verifyPassword,
} from '../../common/utils/hash.util';
import { parseDurationToMs } from '../../common/utils/duration.util';
import { RegisterDto } from './dto/register.dto';
import { JwtAccessPayload, JwtRefreshPayload } from '../../common/types/jwt-payload.type';
import { AuthResult, AuthUserView } from './types/auth-result.type';

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  sessionId: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: AppConfigService,
    private readonly usersService: UsersService,
    private readonly organizationsService: OrganizationsService,
    private readonly mailQueue: MailQueueService,
  ) {}

  // ---------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------

  async register(
    dto: RegisterDto,
    meta: RequestMeta,
  ): Promise<AuthResult & { refreshToken: string }> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await hashPassword(dto.password, this.config.bcryptSaltRounds);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        status: 'PENDING_VERIFICATION',
      },
    });

    const organization = await this.organizationsService.createWithOwner(
      user,
      dto.organizationName,
      dto.plan,
    );

    await this.issueEmailVerificationToken(user);

    const session = await this.issueSession(user, meta, false);

    this.logger.log(`New user registered: ${user.email} (org: ${organization.slug})`);

    return {
      user: this.toUserView(user, organization.id),
      tokens: { accessToken: session.accessToken, expiresIn: this.config.jwt.accessExpiresIn },
      refreshToken: session.refreshToken,
    };
  }

  // ---------------------------------------------------------------------
  // Login
  // ---------------------------------------------------------------------

  /** Called by LocalStrategy. Returns the user on success, null on bad credentials. */
  async validateCredentials(email: string, password: string): Promise<User | null> {
    const user = await this.usersService.findByEmail(email.toLowerCase());
    if (!user) {
      return null;
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException(
        `Account temporarily locked due to too many failed login attempts. Try again after ${user.lockedUntil.toISOString()}`,
      );
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      await this.registerFailedLogin(user);
      return null;
    }

    if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
      throw new ForbiddenException(
        'This account has been suspended. Contact support for assistance.',
      );
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    return user;
  }

  async login(user: User, rememberMe: boolean | undefined, meta: RequestMeta) {
    const [organizations] = await Promise.all([
      this.organizationsService.listForUser(user.id),
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date(), lastLoginIp: meta.ipAddress },
      }),
    ]);

    const session = await this.issueSession(user, meta, Boolean(rememberMe));
    const primaryOrgId = organizations[0]?.organization.id ?? '';

    return {
      user: this.toUserView(user, primaryOrgId),
      organizations: organizations.map((o) => ({
        id: o.organization.id,
        name: o.organization.name,
        slug: o.organization.slug,
        role: o.role.slug,
      })),
      tokens: { accessToken: session.accessToken, expiresIn: this.config.jwt.accessExpiresIn },
      refreshToken: session.refreshToken,
    };
  }

  private async registerFailedLogin(user: User) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= MAX_FAILED_LOGIN_ATTEMPTS;
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_DURATION_MS) : user.lockedUntil,
      },
    });
  }

  // ---------------------------------------------------------------------
  // Session issuance / refresh / revocation
  // ---------------------------------------------------------------------

  private async issueSession(
    user: User,
    meta: RequestMeta,
    rememberMe: boolean,
  ): Promise<IssuedSession> {
    const refreshTtl = rememberMe
      ? this.config.jwt.refreshRememberExpiresIn
      : this.config.jwt.refreshExpiresIn;
    const refreshExpiresAt = new Date(Date.now() + parseDurationToMs(refreshTtl));

    // Created with a throwaway hash first because the refresh JWT payload needs the session id.
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: generateOpaqueToken().hash,
        userAgent: meta.userAgent?.slice(0, 500),
        ipAddress: meta.ipAddress,
        isRememberMe: rememberMe,
        expiresAt: refreshExpiresAt,
      },
    });

    const accessPayload: JwtAccessPayload = {
      sub: user.id,
      email: user.email,
      sessionId: session.id,
    };
    const accessToken = this.jwtService.sign(accessPayload, {
      secret: this.config.jwt.accessSecret,
      expiresIn: this.config.jwt.accessExpiresIn,
    });

    const refreshPayload: JwtRefreshPayload = {
      sub: user.id,
      sessionId: session.id,
      jti: randomUUID(),
    };
    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.config.jwt.refreshSecret,
      expiresIn: refreshTtl,
    });

    await this.prisma.session.update({
      where: { id: session.id },
      data: { refreshTokenHash: sha256(refreshToken) },
    });

    return { accessToken, refreshToken, refreshExpiresAt, sessionId: session.id };
  }

  async refresh(refreshToken: string, meta: RequestMeta) {
    let payload: JwtRefreshPayload;
    try {
      payload = this.jwtService.verify<JwtRefreshPayload>(refreshToken, {
        secret: this.config.jwt.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const session = await this.prisma.session.findUnique({ where: { id: payload.sessionId } });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session is no longer valid, please log in again');
    }

    if (session.refreshTokenHash !== sha256(refreshToken)) {
      // Token reuse detected (already rotated or stolen) — kill the session outright.
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      this.logger.warn(`Refresh token reuse detected for session ${session.id}`);
      throw new UnauthorizedException('Refresh token has already been used, please log in again');
    }

    const user = await this.usersService.findById(payload.sub);
    if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
      throw new ForbiddenException('This account has been suspended');
    }

    const refreshTtl = session.isRememberMe
      ? this.config.jwt.refreshRememberExpiresIn
      : this.config.jwt.refreshExpiresIn;
    const newExpiresAt = new Date(Date.now() + parseDurationToMs(refreshTtl));

    const newRefreshPayload: JwtRefreshPayload = {
      sub: user.id,
      sessionId: session.id,
      jti: randomUUID(),
    };
    const newRefreshToken = this.jwtService.sign(newRefreshPayload, {
      secret: this.config.jwt.refreshSecret,
      expiresIn: refreshTtl,
    });

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: sha256(newRefreshToken),
        expiresAt: newExpiresAt,
        lastUsedAt: new Date(),
        ipAddress: meta.ipAddress ?? session.ipAddress,
        userAgent: meta.userAgent?.slice(0, 500) ?? session.userAgent,
      },
    });

    const accessPayload: JwtAccessPayload = {
      sub: user.id,
      email: user.email,
      sessionId: session.id,
    };
    const accessToken = this.jwtService.sign(accessPayload, {
      secret: this.config.jwt.accessSecret,
      expiresIn: this.config.jwt.accessExpiresIn,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: this.config.jwt.accessExpiresIn,
    };
  }

  async logout(sessionId: string) {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async logoutAll(userId: string) {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async listSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        isRememberMe: true,
        lastUsedAt: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.session.findFirst({ where: { id: sessionId, userId } });
    if (!session) {
      throw new BadRequestException('Session not found');
    }
    await this.prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  }

  // ---------------------------------------------------------------------
  // Email verification
  // ---------------------------------------------------------------------

  private async issueEmailVerificationToken(user: User) {
    const { raw, hash } = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + this.config.emailVerificationTtlHours * 60 * 60 * 1000);

    await this.prisma.emailVerificationToken.create({
      data: { userId: user.id, tokenHash: hash, expiresAt },
    });

    const verificationUrl = `${this.config.webAppUrl}/verify-email?token=${raw}`;
    await this.mailQueue.sendVerificationEmail({
      toEmail: user.email,
      firstName: user.firstName,
      verificationUrl,
    });
  }

  async resendVerificationEmail(userId: string) {
    const user = await this.usersService.findById(userId);
    if (user.isEmailVerified) {
      throw new ConflictException('Email is already verified');
    }

    await this.prisma.emailVerificationToken.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    await this.issueEmailVerificationToken(user);
  }

  async verifyEmail(rawToken: string) {
    const tokenHash = sha256(rawToken);
    const token = await this.prisma.emailVerificationToken.findFirst({
      where: { tokenHash, consumedAt: null, expiresAt: { gt: new Date() } },
    });

    if (!token) {
      throw new BadRequestException('This verification link is invalid or has expired');
    }

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: token.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: token.userId },
        data: { isEmailVerified: true, status: 'ACTIVE' },
      }),
    ]);

    const user = await this.usersService.findById(token.userId);
    await this.mailQueue.sendWelcomeEmail({ toEmail: user.email, firstName: user.firstName });
  }

  // ---------------------------------------------------------------------
  // Password reset
  // ---------------------------------------------------------------------

  async forgotPassword(email: string, meta: RequestMeta) {
    const user = await this.usersService.findByEmail(email.toLowerCase());
    // Always resolve without revealing whether the account exists.
    if (!user || user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
      return;
    }

    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const { raw, hash } = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + this.config.passwordResetTtlMinutes * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hash, expiresAt, requestIp: meta.ipAddress },
    });

    const resetUrl = `${this.config.webAppUrl}/reset-password?token=${raw}`;
    await this.mailQueue.sendPasswordResetEmail({
      toEmail: user.email,
      firstName: user.firstName,
      resetUrl,
    });
  }

  async resetPassword(rawToken: string, newPassword: string) {
    const tokenHash = sha256(rawToken);
    const token = await this.prisma.passwordResetToken.findFirst({
      where: { tokenHash, consumedAt: null, expiresAt: { gt: new Date() } },
    });

    if (!token) {
      throw new BadRequestException('This password reset link is invalid or has expired');
    }

    const passwordHash = await hashPassword(newPassword, this.config.bcryptSaltRounds);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: token.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: token.userId },
        data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
      }),
      this.prisma.session.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  // ---------------------------------------------------------------------
  // Impersonation (super-admin only — authorization enforced by the caller)
  // ---------------------------------------------------------------------

  /**
   * Mints a login session for `targetUser` so a super-admin can view the app as a
   * customer. BOTH tokens are returned in the body (the controller must NOT set the
   * refresh cookie) — that keeps the admin's own httpOnly refresh cookie intact, so
   * "Exit impersonation" is a pure client-side drop with no re-login. No privilege is
   * fabricated: the session belongs to the target user, who genuinely owns that org.
   */
  async issueImpersonationSession(targetUser: User, meta: RequestMeta) {
    const session = await this.issueSession(targetUser, meta, false);
    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: this.config.jwt.accessExpiresIn,
    };
  }

  // ---------------------------------------------------------------------

  private toUserView(user: User, organizationId: string): AuthUserView {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isEmailVerified: user.isEmailVerified,
      status: user.status,
      organizationId,
    };
  }
}
