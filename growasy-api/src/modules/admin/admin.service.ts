import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, AuditAction, SubscriptionStatus, BillingCycle, OrgPlanTier } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { ChangePlanDto, SetActiveDto, SetSuperAdminDto } from './dto/admin.dto';

/** Request context threaded into the audit trail. */
export interface AdminActionMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

function currentPeriodKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Monthly-equivalent amount (minor units) for MRR. Yearly plans are divided by 12. */
function monthlyEquivalent(plan: { monthlyPrice: number; yearlyPrice: number }, cycle: BillingCycle): number {
  return cycle === 'YEARLY' ? Math.round(plan.yearlyPrice / 12) : plan.monthlyPrice;
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Overview / metrics
  // ---------------------------------------------------------------------------

  async getOverview() {
    const period = currentPeriodKey();
    const [
      totalOrgs,
      activeOrgs,
      totalUsers,
      superAdmins,
      connectedAccounts,
      subsByStatus,
      activeSubs,
      dmUsage,
      newOrgs30d,
      recentSignups,
    ] = await Promise.all([
      this.prisma.organization.count({ where: { deletedAt: null } }),
      this.prisma.organization.count({ where: { deletedAt: null, isActive: true } }),
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null, isSuperAdmin: true } }),
      this.prisma.instagramAccount.count({ where: { deletedAt: null, status: 'CONNECTED' } }),
      this.prisma.subscription.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.subscription.findMany({
        where: { status: { in: ['ACTIVE', 'TRIALING'] } },
        select: { billingCycle: true, plan: { select: { monthlyPrice: true, yearlyPrice: true, currency: true } } },
      }),
      this.prisma.usageTracking.aggregate({
        where: { metric: 'MESSAGES_SENT', period },
        _sum: { count: true },
      }),
      this.prisma.organization.count({
        where: { deletedAt: null, createdAt: { gte: new Date(Date.now() - 30 * 864e5) } },
      }),
      this.prisma.organization.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, name: true, slug: true, createdAt: true, owner: { select: { email: true } } },
      }),
    ]);

    const currency = activeSubs[0]?.plan.currency ?? 'INR';
    const mrrMinor = activeSubs.reduce(
      (sum, s) => sum + monthlyEquivalent(s.plan, s.billingCycle),
      0,
    );
    const statusCounts: Record<string, number> = {};
    for (const row of subsByStatus) statusCounts[row.status] = row._count._all;

    return {
      totals: {
        organizations: totalOrgs,
        activeOrganizations: activeOrgs,
        users: totalUsers,
        superAdmins,
        connectedInstagramAccounts: connectedAccounts,
        newOrganizations30d: newOrgs30d,
      },
      subscriptions: {
        byStatus: statusCounts,
        mrrMinor,
        currency,
      },
      usage: {
        period,
        dmsSent: dmUsage._sum.count ?? 0,
      },
      recentSignups: recentSignups.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        ownerEmail: o.owner.email,
        createdAt: o.createdAt,
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Customers (organizations)
  // ---------------------------------------------------------------------------

  async listCustomers(query: { search?: string; page: number; pageSize: number }) {
    const where: Prisma.OrganizationWhereInput = { deletedAt: null };
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { slug: { contains: search } },
        { owner: { email: { contains: search } } },
      ];
    }

    const [total, orgs] = await Promise.all([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
          createdAt: true,
          owner: { select: { id: true, email: true, firstName: true, lastName: true } },
          subscription: {
            select: {
              status: true,
              billingCycle: true,
              currentPeriodEnd: true,
              trialEndsAt: true,
              plan: { select: { name: true, tier: true } },
            },
          },
          _count: { select: { members: true, instagramAccounts: true, automationRules: true } },
        },
      }),
    ]);

    const data = orgs.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      isActive: o.isActive,
      createdAt: o.createdAt,
      owner: o.owner,
      plan: o.subscription?.plan.name ?? 'Free',
      tier: o.subscription?.plan.tier ?? 'FREE',
      subscriptionStatus: o.subscription?.status ?? null,
      trialEndsAt: o.subscription?.trialEndsAt ?? null,
      currentPeriodEnd: o.subscription?.currentPeriodEnd ?? null,
      members: o._count.members,
      instagramAccounts: o._count.instagramAccounts,
      automations: o._count.automationRules,
    }));

    return {
      items: data,
      page: query.page,
      pageSize: query.pageSize,
      total,
      hasMore: query.page * query.pageSize < total,
    };
  }

  async getCustomer(orgId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: orgId, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        timezone: true,
        createdAt: true,
        owner: { select: { id: true, email: true, firstName: true, lastName: true, status: true, lastLoginAt: true } },
        members: {
          where: { deletedAt: null },
          select: {
            status: true,
            user: { select: { id: true, email: true, firstName: true, lastName: true, status: true } },
            role: { select: { name: true, slug: true } },
          },
        },
        instagramAccounts: {
          where: { deletedAt: null },
          select: { id: true, username: true, status: true, instagramBusinessId: true, lastSyncedAt: true },
        },
        subscription: {
          select: {
            id: true,
            status: true,
            billingCycle: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            trialEndsAt: true,
            cancelAtPeriodEnd: true,
            plan: { select: { name: true, tier: true, monthlyPrice: true, yearlyPrice: true, currency: true } },
          },
        },
        usageTracking: {
          orderBy: { period: 'desc' },
          take: 10,
          select: { metric: true, period: true, count: true },
        },
        invoices: {
          orderBy: { issuedAt: 'desc' },
          take: 10,
          select: { id: true, invoiceNumber: true, amount: true, currency: true, status: true, issuedAt: true, paidAt: true },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, amount: true, currency: true, status: true, method: true, createdAt: true, paidAt: true },
        },
        _count: { select: { automationRules: true, contacts: true } },
      },
    });
    if (!org) throw new NotFoundException('Customer not found');

    // Recent automation activity for this org's Instagram accounts.
    const accountIds = org.instagramAccounts.map((a) => a.id);
    const recentActivity = accountIds.length
      ? await this.prisma.processedComment.findMany({
          where: { instagramAccountId: { in: accountIds } },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { id: true, commenterId: true, outcome: true, matched: true, dmSent: true, createdAt: true },
        })
      : [];

    return { ...org, recentActivity };
  }

  // ---------------------------------------------------------------------------
  // Plan / subscription management
  // ---------------------------------------------------------------------------

  async changePlan(orgId: string, dto: ChangePlanDto, actor: AuthenticatedUser, meta: AdminActionMeta) {
    const org = await this.prisma.organization.findFirst({
      where: { id: orgId, deletedAt: null },
      select: { id: true, subscription: true },
    });
    if (!org) throw new NotFoundException('Customer not found');

    // Resolve the target plan when a tier change is requested.
    let planId = org.subscription?.planId ?? null;
    if (dto.tier) {
      const plan = await this.prisma.plan.findUnique({ where: { tier: dto.tier }, select: { id: true } });
      if (!plan) throw new BadRequestException(`No plan configured for tier ${dto.tier}`);
      planId = plan.id;
    }

    let trialEndsAt: Date | null | undefined;
    if (dto.trialEndsAt !== undefined) {
      trialEndsAt = dto.trialEndsAt === '' ? null : new Date(dto.trialEndsAt);
      if (trialEndsAt && Number.isNaN(trialEndsAt.getTime())) {
        throw new BadRequestException('trialEndsAt is not a valid date');
      }
    }

    const before = org.subscription ? { ...org.subscription } : null;

    let subscription;
    if (org.subscription) {
      subscription = await this.prisma.subscription.update({
        where: { organizationId: orgId },
        data: {
          planId: planId ?? undefined,
          status: dto.status,
          billingCycle: dto.billingCycle,
          trialEndsAt,
          cancelAtPeriodEnd: dto.cancelAtPeriodEnd,
        },
        include: { plan: { select: { name: true, tier: true } } },
      });
    } else {
      if (!planId) throw new BadRequestException('A tier is required to create a subscription');
      const now = new Date();
      subscription = await this.prisma.subscription.create({
        data: {
          organizationId: orgId,
          planId,
          status: dto.status ?? SubscriptionStatus.ACTIVE,
          billingCycle: dto.billingCycle ?? BillingCycle.MONTHLY,
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 30 * 864e5),
          trialEndsAt: trialEndsAt ?? null,
          cancelAtPeriodEnd: dto.cancelAtPeriodEnd ?? false,
        },
        include: { plan: { select: { name: true, tier: true } } },
      });
    }

    await this.audit(actor, meta, {
      action: AuditAction.UPDATE,
      entityType: 'Subscription',
      entityId: subscription.id,
      organizationId: orgId,
      before,
      after: { ...subscription, reason: dto.reason ?? null },
    });

    return subscription;
  }

  // ---------------------------------------------------------------------------
  // Suspend / reactivate
  // ---------------------------------------------------------------------------

  async setOrgActive(orgId: string, isActive: boolean, dto: SetActiveDto, actor: AuthenticatedUser, meta: AdminActionMeta) {
    const org = await this.prisma.organization.findFirst({
      where: { id: orgId, deletedAt: null },
      select: { id: true, isActive: true, members: { where: { deletedAt: null }, select: { userId: true } } },
    });
    if (!org) throw new NotFoundException('Customer not found');

    const updated = await this.prisma.organization.update({
      where: { id: orgId },
      data: { isActive },
      select: { id: true, name: true, isActive: true },
    });

    // Deactivating logs every member out immediately (sessions are DB-checked per request).
    if (!isActive) {
      const userIds = org.members.map((m) => m.userId);
      if (userIds.length) {
        await this.prisma.session.updateMany({
          where: { userId: { in: userIds }, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    }

    await this.audit(actor, meta, {
      action: AuditAction.OTHER,
      entityType: 'Organization',
      entityId: orgId,
      organizationId: orgId,
      before: { isActive: org.isActive },
      after: { isActive, reason: dto.reason ?? null },
    });

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------------

  async listUsers(query: { search?: string; page: number; pageSize: number }) {
    const where: Prisma.UserWhereInput = { deletedAt: null };
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { email: { contains: search } },
        { firstName: { contains: search } },
        { lastName: { contains: search } },
      ];
    }

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          status: true,
          isSuperAdmin: true,
          isEmailVerified: true,
          lastLoginAt: true,
          createdAt: true,
          _count: { select: { ownedOrganizations: true } },
        },
      }),
    ]);

    return {
      items: users.map((u) => ({ ...u, ownedOrganizations: u._count.ownedOrganizations })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      hasMore: query.page * query.pageSize < total,
    };
  }

  async setUserSuperAdmin(userId: string, dto: SetSuperAdminDto, actor: AuthenticatedUser, meta: AdminActionMeta) {
    if (userId === actor.id && dto.isSuperAdmin === false) {
      throw new BadRequestException('You cannot remove your own super-admin access');
    }
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, isSuperAdmin: true, email: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isSuperAdmin: dto.isSuperAdmin },
      select: { id: true, email: true, isSuperAdmin: true },
    });

    await this.audit(actor, meta, {
      action: AuditAction.PERMISSION_CHANGE,
      entityType: 'User',
      entityId: userId,
      before: { isSuperAdmin: user.isSuperAdmin },
      after: { isSuperAdmin: dto.isSuperAdmin, reason: dto.reason ?? null },
    });

    return updated;
  }

  async setUserSuspended(userId: string, suspended: boolean, dto: SetActiveDto, actor: AuthenticatedUser, meta: AdminActionMeta) {
    if (userId === actor.id) {
      throw new BadRequestException('You cannot suspend your own account');
    }
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, status: true, isSuperAdmin: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.isSuperAdmin && suspended) {
      throw new ForbiddenException('Demote this super-admin before suspending them');
    }

    const nextStatus = suspended ? 'SUSPENDED' : 'ACTIVE';
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status: nextStatus },
      select: { id: true, email: true, status: true },
    });

    if (suspended) {
      await this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.audit(actor, meta, {
      action: AuditAction.OTHER,
      entityType: 'User',
      entityId: userId,
      before: { status: user.status },
      after: { status: nextStatus, reason: dto.reason ?? null },
    });

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Audit log feed
  // ---------------------------------------------------------------------------

  async listAuditLog(query: { page: number; pageSize: number }) {
    const [total, entries] = await Promise.all([
      this.prisma.auditLog.count(),
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          organizationId: true,
          ipAddress: true,
          after: true,
          createdAt: true,
          actor: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      }),
    ]);
    return {
      items: entries,
      page: query.page,
      pageSize: query.pageSize,
      total,
      hasMore: query.page * query.pageSize < total,
    };
  }

  // ---------------------------------------------------------------------------
  // Usage / comp / account management (extra admin powers)
  // ---------------------------------------------------------------------------

  /** Reset a customer's DM counter to 0, or grant bonus headroom for the period. */
  async adjustUsage(
    orgId: string,
    dto: { action: 'reset' | 'grant'; amount?: number },
    actor: AuthenticatedUser,
    meta: AdminActionMeta,
  ) {
    const org = await this.prisma.organization.findFirst({
      where: { id: orgId, deletedAt: null },
      select: { id: true },
    });
    if (!org) throw new NotFoundException('Customer not found');

    if (dto.action === 'reset') {
      const res = await this.prisma.usageTracking.updateMany({
        where: { organizationId: orgId, metric: 'MESSAGES_SENT' },
        data: { count: 0 },
      });
      await this.audit(actor, meta, {
        action: AuditAction.UPDATE,
        entityType: 'UsageTracking',
        entityId: orgId,
        organizationId: orgId,
        after: { action: 'reset', rowsAffected: res.count },
      });
      return { action: 'reset', rowsAffected: res.count };
    }

    // grant: free up `amount` DMs by decrementing the current period's counter.
    const amount = Math.max(1, dto.amount ?? 0);
    const row = await this.prisma.usageTracking.findFirst({
      where: { organizationId: orgId, metric: 'MESSAGES_SENT' },
      orderBy: { period: 'desc' },
      select: { id: true, count: true, period: true },
    });
    if (!row) throw new BadRequestException('No usage recorded yet this period');
    const next = Math.max(0, row.count - amount);
    await this.prisma.usageTracking.update({ where: { id: row.id }, data: { count: next } });
    await this.audit(actor, meta, {
      action: AuditAction.UPDATE,
      entityType: 'UsageTracking',
      entityId: orgId,
      organizationId: orgId,
      before: { count: row.count },
      after: { action: 'grant', amount, count: next, period: row.period },
    });
    return { action: 'grant', granted: amount, count: next, period: row.period };
  }

  /** Give a customer a paid tier free for `days` days (won't auto-charge). */
  async compPlan(
    orgId: string,
    dto: { tier: OrgPlanTier; days: number; reason?: string },
    actor: AuthenticatedUser,
    meta: AdminActionMeta,
  ) {
    const org = await this.prisma.organization.findFirst({
      where: { id: orgId, deletedAt: null },
      select: { id: true, subscription: true },
    });
    if (!org) throw new NotFoundException('Customer not found');
    const plan = await this.prisma.plan.findUnique({ where: { tier: dto.tier }, select: { id: true } });
    if (!plan) throw new BadRequestException(`No plan configured for tier ${dto.tier}`);

    const now = new Date();
    const until = new Date(now.getTime() + dto.days * 864e5);
    const data = {
      planId: plan.id,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: now,
      currentPeriodEnd: until,
      trialEndsAt: until,
      cancelAtPeriodEnd: true, // comped — don't roll into a paid charge
    };

    const before = org.subscription ? { ...org.subscription } : null;
    const subscription = org.subscription
      ? await this.prisma.subscription.update({ where: { organizationId: orgId }, data, include: { plan: { select: { name: true, tier: true } } } })
      : await this.prisma.subscription.create({
          data: { organizationId: orgId, billingCycle: BillingCycle.MONTHLY, ...data },
          include: { plan: { select: { name: true, tier: true } } },
        });

    await this.audit(actor, meta, {
      action: AuditAction.UPDATE,
      entityType: 'Subscription',
      entityId: subscription.id,
      organizationId: orgId,
      before,
      after: { comp: true, tier: dto.tier, days: dto.days, until, reason: dto.reason ?? null },
    });
    return subscription;
  }

  /** Post an in-app notification to the customer's owner. */
  async notifyCustomer(
    orgId: string,
    dto: { title: string; body?: string },
    actor: AuthenticatedUser,
    meta: AdminActionMeta,
  ) {
    const org = await this.prisma.organization.findFirst({
      where: { id: orgId, deletedAt: null },
      select: { id: true, ownerId: true },
    });
    if (!org) throw new NotFoundException('Customer not found');

    const notification = await this.prisma.notification.create({
      data: {
        organizationId: orgId,
        userId: org.ownerId,
        type: 'SYSTEM',
        title: dto.title,
        body: dto.body ?? null,
        metadata: JSON.stringify({ fromAdmin: true }),
      },
      select: { id: true },
    });
    await this.audit(actor, meta, {
      action: AuditAction.OTHER,
      entityType: 'Notification',
      entityId: notification.id,
      organizationId: orgId,
      after: { title: dto.title },
    });
    return notification;
  }

  /** Force-disconnect a customer's Instagram account (e.g. a broken/leaked token). */
  async disconnectAccount(orgId: string, accountId: string, actor: AuthenticatedUser, meta: AdminActionMeta) {
    const account = await this.prisma.instagramAccount.findFirst({
      where: { id: accountId, organizationId: orgId, deletedAt: null },
      select: { id: true, username: true, status: true },
    });
    if (!account) throw new NotFoundException('Instagram account not found for this customer');

    await this.prisma.instagramAccount.update({
      where: { id: accountId },
      data: { status: 'DISCONNECTED', deletedAt: new Date() },
    });
    await this.audit(actor, meta, {
      action: AuditAction.OTHER,
      entityType: 'InstagramAccount',
      entityId: accountId,
      organizationId: orgId,
      before: { status: account.status },
      after: { status: 'DISCONNECTED', disconnected: true },
    });
    return { id: accountId, username: account.username };
  }

  /** Manually mark a user's email verified (unblock a stuck signup). */
  async verifyUserEmail(userId: string, actor: AuthenticatedUser, meta: AdminActionMeta) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true, isEmailVerified: true, status: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isEmailVerified: true,
        status: user.status === 'PENDING_VERIFICATION' ? 'ACTIVE' : undefined,
      },
      select: { id: true, email: true, isEmailVerified: true, status: true },
    });
    await this.audit(actor, meta, {
      action: AuditAction.UPDATE,
      entityType: 'User',
      entityId: userId,
      before: { isEmailVerified: user.isEmailVerified, status: user.status },
      after: { isEmailVerified: true, status: updated.status },
    });
    return updated;
  }

  // ---------------------------------------------------------------------------

  /** Resolve the org to impersonate into — returns the org + its owner user. */
  async resolveImpersonationTarget(orgId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: orgId, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        owner: true, // full User row — AuthService needs it to mint a session
      },
    });
    if (!org) throw new NotFoundException('Customer not found');
    if (org.owner.isSuperAdmin) {
      throw new ForbiddenException('Refusing to impersonate another super-admin');
    }
    return org;
  }

  /** Writes an admin action to the audit trail. Public so the controller can log impersonation. */
  async audit(
    actor: AuthenticatedUser,
    meta: AdminActionMeta,
    entry: {
      action: AuditAction;
      entityType: string;
      entityId?: string | null;
      organizationId?: string | null;
      before?: unknown;
      after?: unknown;
    },
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        organizationId: entry.organizationId ?? null,
        actorUserId: actor.id,
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent?.slice(0, 500) ?? null,
        before: entry.before != null ? JSON.stringify(entry.before) : null,
        after: entry.after != null ? JSON.stringify(entry.after) : null,
      },
    });
  }
}
