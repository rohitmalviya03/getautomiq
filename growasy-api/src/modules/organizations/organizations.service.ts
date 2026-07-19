import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OrgPlanTier, Prisma, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { slugWithSuffix } from '../../common/utils/slug.util';
import { SYSTEM_ROLES, SYSTEM_ROLE_PERMISSIONS } from '../../common/constants/permissions.constant';

const TRIAL_PERIOD_DAYS = 14;

/** Shared include for member queries — user identity + role, no secrets. */
const MEMBER_INCLUDE = {
  user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
  role: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.OrganizationMemberInclude;

type MemberWithRelations = Prisma.OrganizationMemberGetPayload<{ include: typeof MEMBER_INCLUDE }>;

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  /**
   * Bootstraps a brand-new organization for a freshly registered user:
   * seeds the four system roles with their permission sets, adds the user as
   * OWNER, and (best-effort) starts a Starter trial subscription. Runs inside
   * a single transaction so a partial failure never leaves an orphaned org.
   */
  async createWithOwner(owner: User, name?: string, planTier?: OrgPlanTier) {
    const organizationName = name?.trim() || `${owner.firstName}'s Workspace`;

    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: organizationName,
          slug: slugWithSuffix(organizationName),
          ownerId: owner.id,
        },
      });

      const permissionCatalog = await tx.permission.findMany();
      const permissionsByKey = new Map(
        permissionCatalog.map((p) => [`${p.resource}:${p.action}`, p.id]),
      );

      for (const [slug, permissionKeys] of Object.entries(SYSTEM_ROLE_PERMISSIONS)) {
        const role = await tx.role.create({
          data: {
            organizationId: organization.id,
            name: slug.charAt(0).toUpperCase() + slug.slice(1),
            slug,
            isSystem: true,
          },
        });

        const permissionIds = permissionKeys
          .map((key) => permissionsByKey.get(key))
          .filter((id): id is string => Boolean(id));

        if (permissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
          });
        }

        if (slug === SYSTEM_ROLES.OWNER) {
          await tx.organizationMember.create({
            data: {
              organizationId: organization.id,
              userId: owner.id,
              roleId: role.id,
              status: 'ACTIVE',
              joinedAt: new Date(),
            },
          });
        }
      }

      await this.startSubscription(tx, organization.id, planTier);

      return organization;
    });
  }

  /**
   * Puts a new org on its chosen plan. Free → immediately ACTIVE; a paid plan →
   * TRIALING for the trial window. Falls back to Free if the requested tier isn't
   * an offered/active plan (e.g. a coming-soon or retired tier).
   */
  private async startSubscription(
    tx: Prisma.TransactionClient,
    organizationId: string,
    planTier?: OrgPlanTier,
  ) {
    const tier = planTier ?? OrgPlanTier.FREE;
    const plan =
      (await tx.plan.findFirst({ where: { tier, isActive: true } })) ??
      (await tx.plan.findFirst({ where: { tier: OrgPlanTier.FREE, isActive: true } }));
    if (!plan) {
      this.logger.warn(
        `No active plan for tier ${tier} (run prisma:seed) — skipping subscription for org ${organizationId}`,
      );
      return;
    }

    const now = new Date();
    const isPaid = plan.monthlyPrice > 0;
    const trialEndsAt = isPaid
      ? new Date(now.getTime() + TRIAL_PERIOD_DAYS * 24 * 60 * 60 * 1000)
      : null;
    const periodEnd =
      trialEndsAt ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await tx.subscription.create({
      data: {
        organizationId,
        planId: plan.id,
        status: isPaid ? 'TRIALING' : 'ACTIVE',
        billingCycle: 'MONTHLY',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        trialEndsAt,
      },
    });
  }

  async findById(organizationId: string) {
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    return organization;
  }

  async listForUser(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId, status: 'ACTIVE', deletedAt: null },
      include: { organization: true, role: true },
    });
    return memberships
      .filter((m) => !m.organization.deletedAt)
      .map((m) => ({
        organization: m.organization,
        role: { id: m.role.id, name: m.role.name, slug: m.role.slug },
      }));
  }

  async assertMembership(userId: string, organizationId: string) {
    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId, organizationId, status: 'ACTIVE', deletedAt: null },
    });
    if (!membership) {
      throw new ForbiddenException('You are not a member of this organization');
    }
    return membership;
  }

  // --- Team management ------------------------------------------------------

  /** Creates an additional workspace owned by the user (Free plan). */
  async createForUser(userId: string, name?: string) {
    // Gate multi-workspace behind the plan feature (Growth+).
    await this.planLimits.assertCanCreateWorkspace(userId);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const org = await this.createWithOwner(user, name, OrgPlanTier.FREE);
    return this.findById(org.id);
  }

  /** The org's assignable roles (everything except Owner) for the invite UI. */
  async listRoles(userId: string, organizationId: string) {
    await this.assertMembership(userId, organizationId);
    const roles = await this.prisma.role.findMany({
      where: { organizationId, deletedAt: null, slug: { not: SYSTEM_ROLES.OWNER } },
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' },
    });
    return roles;
  }

  async listMembers(userId: string, organizationId: string) {
    await this.assertMembership(userId, organizationId);
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId, deletedAt: null, status: { not: 'REMOVED' } },
      include: MEMBER_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { ownerId: true },
    });
    return members.map((m) => this.toMemberView(m, org?.ownerId ?? null));
  }

  /** Adds an existing Automiq user to the org with the given role. */
  async inviteMember(userId: string, organizationId: string, email: string, roleSlug: string) {
    await this.assertMembership(userId, organizationId);
    // Enforce the plan's team-seat cap (Free/Starter = single seat).
    await this.planLimits.assertCanInviteMember(organizationId);

    const invitee = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
      select: { id: true },
    });
    if (!invitee) {
      throw new NotFoundException(
        'No Automiq account uses that email yet — ask them to sign up first, then invite.',
      );
    }

    const role = await this.resolveRole(organizationId, roleSlug);

    const existing = await this.prisma.organizationMember.findFirst({
      where: { organizationId, userId: invitee.id },
    });
    if (existing && existing.status === 'ACTIVE' && !existing.deletedAt) {
      throw new ConflictException('That person is already a member of this workspace.');
    }

    // Reactivate a previously removed member, or create a fresh membership.
    const member = existing
      ? await this.prisma.organizationMember.update({
          where: { id: existing.id },
          data: { roleId: role.id, status: 'ACTIVE', deletedAt: null, joinedAt: new Date() },
          include: MEMBER_INCLUDE,
        })
      : await this.prisma.organizationMember.create({
          data: {
            organizationId,
            userId: invitee.id,
            roleId: role.id,
            status: 'ACTIVE',
            invitedByUserId: userId,
            joinedAt: new Date(),
          },
          include: MEMBER_INCLUDE,
        });

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { ownerId: true },
    });
    return this.toMemberView(member, org?.ownerId ?? null);
  }

  async updateMemberRole(
    userId: string,
    organizationId: string,
    memberId: string,
    roleSlug: string,
  ) {
    await this.assertMembership(userId, organizationId);
    const member = await this.getMemberOrThrow(organizationId, memberId);
    await this.assertNotOwner(organizationId, member.userId, 'change the owner’s role');

    const role = await this.resolveRole(organizationId, roleSlug);
    const updated = await this.prisma.organizationMember.update({
      where: { id: memberId },
      data: { roleId: role.id },
      include: MEMBER_INCLUDE,
    });
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { ownerId: true },
    });
    return this.toMemberView(updated, org?.ownerId ?? null);
  }

  async removeMember(userId: string, organizationId: string, memberId: string) {
    await this.assertMembership(userId, organizationId);
    const member = await this.getMemberOrThrow(organizationId, memberId);
    await this.assertNotOwner(organizationId, member.userId, 'remove the workspace owner');

    await this.prisma.organizationMember.update({
      where: { id: memberId },
      data: { status: 'REMOVED', deletedAt: new Date() },
    });
  }

  // --- helpers --------------------------------------------------------------

  private async getMemberOrThrow(organizationId: string, memberId: string) {
    const member = await this.prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId, deletedAt: null },
    });
    if (!member) {
      throw new NotFoundException('Member not found in this workspace');
    }
    return member;
  }

  private async resolveRole(organizationId: string, roleSlug: string) {
    const role = await this.prisma.role.findFirst({
      where: { organizationId, slug: roleSlug, deletedAt: null },
      select: { id: true },
    });
    if (!role) {
      throw new NotFoundException('That role does not exist in this workspace');
    }
    return role;
  }

  private async assertNotOwner(organizationId: string, memberUserId: string, action: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { ownerId: true },
    });
    if (org?.ownerId === memberUserId) {
      throw new ForbiddenException(`You can’t ${action}.`);
    }
  }

  private toMemberView(m: MemberWithRelations, ownerId: string | null) {
    return {
      id: m.id,
      userId: m.userId,
      name: `${m.user.firstName} ${m.user.lastName}`.trim(),
      email: m.user.email,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
      status: m.status,
      isOwner: m.userId === ownerId,
      joinedAt: m.joinedAt,
      createdAt: m.createdAt,
    };
  }
}
