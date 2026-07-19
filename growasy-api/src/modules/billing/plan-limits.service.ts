import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { OrgPlanTier } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  FEATURE_TIER_MATRIX,
  PLAN_FEATURES,
  PlanFeatureKey,
} from '../../common/constants/plan-features.constant';

/** -1 in a limit field means "unlimited". */
export const UNLIMITED = -1;

/** Shape of the JSON-encoded Plan.limits column. Missing keys → unlimited. */
export interface PlanLimits {
  maxInstagramAccounts: number;
  maxAutomations: number;
  maxMessagesPerMonth: number;
  maxContacts?: number;
  maxTeamMembers?: number;
}

export interface PlanContext {
  planName: string;
  tier: OrgPlanTier;
  limits: PlanLimits;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

/** UTC calendar-month key, e.g. "2026-07" — matches UsageTracking.period. */
export function currentUsagePeriod(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Single source of truth for plan-limit enforcement + usage reporting. Limits
 * live on the org's Subscription→Plan (`limits` JSON); usage lives in
 * UsageTracking keyed by (org, metric, "YYYY-MM"). All enforcement throws the
 * standard `{ error: CODE, message }` envelope (403) via ForbiddenException.
 */
@Injectable()
export class PlanLimitsService {
  private readonly logger = new Logger(PlanLimitsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Loads + parses the org's active plan. Returns null when there's no
   *  subscription (fresh dev install) — callers treat that as "don't block". */
  async getPlanContext(organizationId: string): Promise<PlanContext | null> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    });
    if (!subscription) {
      this.logger.warn(`Org ${organizationId} has no subscription — limits not enforced`);
      return null;
    }

    let limits: PlanLimits;
    try {
      limits = JSON.parse(subscription.plan.limits) as PlanLimits;
    } catch {
      this.logger.error(
        `Plan ${subscription.planId} has malformed limits JSON — treating as unlimited`,
      );
      limits = {
        maxInstagramAccounts: UNLIMITED,
        maxAutomations: UNLIMITED,
        maxMessagesPerMonth: UNLIMITED,
      };
    }

    return {
      planName: subscription.plan.name,
      tier: subscription.plan.tier,
      limits,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
    };
  }

  /** Throws PLAN_ACCOUNT_LIMIT_REACHED when the org is at its Instagram-account cap. */
  async assertCanConnectAccount(organizationId: string): Promise<void> {
    const ctx = await this.getPlanContext(organizationId);
    if (!ctx) return;
    const max = ctx.limits.maxInstagramAccounts ?? UNLIMITED;
    if (max === UNLIMITED) return;

    const current = await this.prisma.instagramAccount.count({
      where: { organizationId, deletedAt: null },
    });
    if (current >= max) {
      throw new ForbiddenException({
        error: 'PLAN_ACCOUNT_LIMIT_REACHED',
        message: `Your ${ctx.planName} plan allows ${max} Instagram account${max === 1 ? '' : 's'}. Upgrade to connect more.`,
      });
    }
  }

  /** Throws PLAN_RULE_LIMIT_REACHED when the org is at its active-rule cap. */
  async assertCanCreateActiveRule(organizationId: string): Promise<void> {
    const ctx = await this.getPlanContext(organizationId);
    if (!ctx) return;
    const max = ctx.limits.maxAutomations ?? UNLIMITED;
    if (max === UNLIMITED) return;

    const current = await this.prisma.automationRule.count({
      where: { organizationId, status: 'ACTIVE', deletedAt: null },
    });
    if (current >= max) {
      throw new ForbiddenException({
        error: 'PLAN_RULE_LIMIT_REACHED',
        message: `Your ${ctx.planName} plan allows ${max} active automation${max === 1 ? '' : 's'}. Upgrade or pause a rule to add more.`,
      });
    }
  }

  /** Throws PLAN_SEAT_LIMIT_REACHED when the org is at its team-seat cap. */
  async assertCanInviteMember(organizationId: string): Promise<void> {
    const ctx = await this.getPlanContext(organizationId);
    if (!ctx) return;
    const max = ctx.limits.maxTeamMembers ?? UNLIMITED;
    if (max === UNLIMITED) return;

    const current = await this.prisma.organizationMember.count({
      where: { organizationId, deletedAt: null, status: { not: 'REMOVED' } },
    });
    if (current >= max) {
      throw new ForbiddenException({
        error: 'PLAN_SEAT_LIMIT_REACHED',
        message:
          max <= 1
            ? `Your ${ctx.planName} plan is single-seat. Upgrade to Growth to invite your team.`
            : `Your ${ctx.planName} plan includes ${max} team seats. Upgrade to add more members.`,
      });
    }
  }

  /**
   * Throws PLAN_WORKSPACE_LIMIT_REACHED when a user tries to own more than one
   * workspace without a plan that unlocks multiple workspaces. Prevents spinning
   * up extra free workspaces to sidestep per-workspace limits.
   */
  async assertCanCreateWorkspace(userId: string): Promise<void> {
    const owned = await this.prisma.organization.count({
      where: { ownerId: userId, deletedAt: null },
    });
    if (owned === 0) return; // the first workspace is always allowed

    const subscriptions = await this.prisma.subscription.findMany({
      where: { organization: { ownerId: userId, deletedAt: null } },
      include: { plan: { select: { tier: true } } },
    });
    const allowedTiers = FEATURE_TIER_MATRIX[PLAN_FEATURES.MULTIPLE_WORKSPACES] ?? [];
    const unlocked = subscriptions.some((s) => allowedTiers.includes(s.plan.tier));
    if (!unlocked) {
      throw new ForbiddenException({
        error: 'PLAN_WORKSPACE_LIMIT_REACHED',
        message:
          'Multiple workspaces are available on the Growth plan and above. Upgrade to create another workspace.',
      });
    }
  }

  /** Powers GET /organizations/me/usage — used/limit per metric + billing anchor. */
  async getUsageSummary(organizationId: string) {
    const ctx = await this.getPlanContext(organizationId);
    const period = currentUsagePeriod();

    const [accountsUsed, activeRulesUsed, membersUsed, dmUsage] = await Promise.all([
      this.prisma.instagramAccount.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.automationRule.count({
        where: { organizationId, status: 'ACTIVE', deletedAt: null },
      }),
      this.prisma.organizationMember.count({
        where: { organizationId, deletedAt: null, status: { not: 'REMOVED' } },
      }),
      this.prisma.usageTracking.findUnique({
        where: {
          organizationId_metric_period: { organizationId, metric: 'MESSAGES_SENT', period },
        },
      }),
    ]);

    return {
      planName: ctx?.planName ?? 'None',
      tier: ctx?.tier ?? null,
      accountsUsed,
      accountsLimit: ctx?.limits.maxInstagramAccounts ?? UNLIMITED,
      activeRulesUsed,
      activeRulesLimit: ctx?.limits.maxAutomations ?? UNLIMITED,
      teamMembersUsed: membersUsed,
      teamMembersLimit: ctx?.limits.maxTeamMembers ?? UNLIMITED,
      dmsUsedThisMonth: dmUsage?.count ?? 0,
      dmsLimit: ctx?.limits.maxMessagesPerMonth ?? UNLIMITED,
      billingCycleAnchor: ctx?.currentPeriodStart ?? null,
      period,
    };
  }

  /** True when the org's tier unlocks the given feature. */
  async hasFeature(organizationId: string, featureKey: PlanFeatureKey): Promise<boolean> {
    const ctx = await this.getPlanContext(organizationId);
    if (!ctx) return false;
    return FEATURE_TIER_MATRIX[featureKey]?.includes(ctx.tier) ?? false;
  }
}
