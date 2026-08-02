import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, DiscountType, Plan, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { PlanLimits } from '../billing/plan-limits.service';
import { PricingService } from '../billing/pricing.service';
import { AdminActionMeta, AdminService } from './admin.service';
import { UpdatePlanDto, UpsertCouponDto } from './dto/pricing.dto';

/** "" / null clear the date; undefined leaves it alone (patch semantics). */
function parseDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`Invalid date: ${value}`);
  return d;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Pricing + discount administration. Every mutation is written to the AuditLog
 * with before/after, because these edits change what customers are charged.
 */
@Injectable()
export class AdminPricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly admin: AdminService,
  ) {}

  // ---- Plans ---------------------------------------------------------------

  /** Full catalogue including hidden/inactive plans, with computed prices. */
  listPlans() {
    return this.pricing.listAllPlans();
  }

  /**
   * Patches one plan. Limits are merged into the existing `limits` JSON so
   * sending only `maxMessagesPerMonth` never wipes the other caps.
   */
  async updatePlan(
    planId: string,
    dto: UpdatePlanDto,
    actor: AuthenticatedUser,
    meta: AdminActionMeta,
  ) {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found.');

    this.assertDiscountSane(dto.promoType ?? plan.promoType, dto.promoValue ?? plan.promoValue);

    const data: Prisma.PlanUpdateInput = {};
    const assign = <K extends keyof UpdatePlanDto>(key: K, target: keyof Prisma.PlanUpdateInput) => {
      if (dto[key] !== undefined) (data as Record<string, unknown>)[target] = dto[key];
    };

    assign('name', 'name');
    assign('monthlyPrice', 'monthlyPrice');
    assign('yearlyPrice', 'yearlyPrice');
    assign('currency', 'currency');
    assign('tag', 'tag');
    assign('subtitle', 'subtitle');
    assign('ctaLabel', 'ctaLabel');
    assign('inheritsLabel', 'inheritsLabel');
    assign('isPopular', 'isPopular');
    assign('isBestValue', 'isBestValue');
    assign('contactSales', 'contactSales');
    assign('isPublic', 'isPublic');
    assign('isActive', 'isActive');
    assign('sortOrder', 'sortOrder');
    assign('promoType', 'promoType');
    assign('promoValue', 'promoValue');
    assign('promoLabel', 'promoLabel');

    const startsAt = parseDate(dto.promoStartsAt);
    if (startsAt !== undefined) data.promoStartsAt = startsAt;
    const endsAt = parseDate(dto.promoEndsAt);
    if (endsAt !== undefined) data.promoEndsAt = endsAt;

    if (dto.features !== undefined) data.features = JSON.stringify(dto.features);

    // Merge limit fields into the existing JSON blob.
    const limitKeys = [
      'maxInstagramAccounts',
      'maxAutomations',
      'maxMessagesPerMonth',
      'maxContacts',
      'maxTeamMembers',
      'aiAgent',
    ] as const;
    if (limitKeys.some((k) => dto[k] !== undefined)) {
      const current = parseJson<PlanLimits>(plan.limits, {
        maxInstagramAccounts: -1,
        maxAutomations: -1,
        maxMessagesPerMonth: -1,
      });
      const merged: Record<string, unknown> = { ...current };
      for (const k of limitKeys) {
        if (dto[k] !== undefined) merged[k] = dto[k];
      }
      data.limits = JSON.stringify(merged);
    }

    // Clearing the promo type should not leave a dangling value behind.
    if (dto.promoType === null) {
      data.promoValue = null;
      data.promoLabel = null;
      data.promoStartsAt = null;
      data.promoEndsAt = null;
    }

    const updated = await this.prisma.plan.update({ where: { id: planId }, data });

    await this.admin.audit(actor, meta, {
      action: AuditAction.UPDATE,
      entityType: 'Plan',
      entityId: planId,
      before: this.auditShape(plan),
      after: { ...this.auditShape(updated), reason: dto.reason ?? null },
    });

    return updated;
  }

  private auditShape(plan: Plan) {
    return {
      tier: plan.tier,
      name: plan.name,
      monthlyPrice: plan.monthlyPrice,
      yearlyPrice: plan.yearlyPrice,
      currency: plan.currency,
      limits: plan.limits,
      features: plan.features,
      isActive: plan.isActive,
      isPublic: plan.isPublic,
      promoType: plan.promoType,
      promoValue: plan.promoValue,
      promoLabel: plan.promoLabel,
      promoStartsAt: plan.promoStartsAt,
      promoEndsAt: plan.promoEndsAt,
    };
  }

  /** A percentage over 100 would produce a negative charge — reject it up front. */
  private assertDiscountSane(type: DiscountType | null | undefined, value: number | null | undefined) {
    if (!type || value == null) return;
    if (type === DiscountType.PERCENT && (value < 1 || value > 100)) {
      throw new BadRequestException('A percentage discount must be between 1 and 100.');
    }
    if (type === DiscountType.FLAT && value < 1) {
      throw new BadRequestException('A flat discount must be at least 1 paisa.');
    }
  }

  // ---- Coupons -------------------------------------------------------------

  async listCoupons() {
    const coupons = await this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
    return coupons.map((c) => ({
      ...c,
      appliesToTiers: parseJson<string[]>(c.appliesToTiers, []),
      appliesToCycles: parseJson<string[]>(c.appliesToCycles, []),
    }));
  }

  async createCoupon(dto: UpsertCouponDto, actor: AuthenticatedUser, meta: AdminActionMeta) {
    const code = (dto.code ?? '').trim().toUpperCase();
    if (!code) throw new BadRequestException('A coupon code is required.');
    if (!dto.type) throw new BadRequestException('A discount type is required.');
    if (!dto.value) throw new BadRequestException('A discount value is required.');
    this.assertDiscountSane(dto.type, dto.value);

    const clash = await this.prisma.coupon.findUnique({ where: { code } });
    if (clash) throw new ConflictException(`Coupon ${code} already exists.`);

    const coupon = await this.prisma.coupon.create({
      data: {
        code,
        description: dto.description ?? null,
        type: dto.type,
        value: dto.value,
        appliesToTiers: JSON.stringify(dto.appliesToTiers ?? []),
        appliesToCycles: JSON.stringify(dto.appliesToCycles ?? []),
        maxRedemptions: dto.maxRedemptions ?? null,
        maxPerOrg: dto.maxPerOrg ?? 1,
        startsAt: parseDate(dto.startsAt) ?? null,
        endsAt: parseDate(dto.endsAt) ?? null,
        isActive: dto.isActive ?? true,
        createdById: actor.id,
      },
    });

    await this.admin.audit(actor, meta, {
      action: AuditAction.CREATE,
      entityType: 'Coupon',
      entityId: coupon.id,
      after: { ...coupon, reason: dto.reason ?? null },
    });

    return coupon;
  }

  /** Patches a coupon. The code itself is immutable — issue a new one instead. */
  async updateCoupon(
    id: string,
    dto: UpsertCouponDto,
    actor: AuthenticatedUser,
    meta: AdminActionMeta,
  ) {
    const before = await this.prisma.coupon.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Coupon not found.');
    this.assertDiscountSane(dto.type ?? before.type, dto.value ?? before.value);

    const data: Prisma.CouponUpdateInput = {};
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.value !== undefined) data.value = dto.value;
    if (dto.appliesToTiers !== undefined) data.appliesToTiers = JSON.stringify(dto.appliesToTiers);
    if (dto.appliesToCycles !== undefined) data.appliesToCycles = JSON.stringify(dto.appliesToCycles);
    if (dto.maxRedemptions !== undefined) data.maxRedemptions = dto.maxRedemptions;
    if (dto.maxPerOrg !== undefined) data.maxPerOrg = dto.maxPerOrg;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    const startsAt = parseDate(dto.startsAt);
    if (startsAt !== undefined) data.startsAt = startsAt;
    const endsAt = parseDate(dto.endsAt);
    if (endsAt !== undefined) data.endsAt = endsAt;

    const coupon = await this.prisma.coupon.update({ where: { id }, data });

    await this.admin.audit(actor, meta, {
      action: AuditAction.UPDATE,
      entityType: 'Coupon',
      entityId: id,
      before,
      after: { ...coupon, reason: dto.reason ?? null },
    });

    return coupon;
  }

  /**
   * Deactivates a coupon. Never hard-deletes: redemptions reference it, and the
   * paper trail of what a customer was charged has to survive.
   */
  async deactivateCoupon(id: string, actor: AuthenticatedUser, meta: AdminActionMeta) {
    const before = await this.prisma.coupon.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Coupon not found.');

    const coupon = await this.prisma.coupon.update({ where: { id }, data: { isActive: false } });
    await this.admin.audit(actor, meta, {
      action: AuditAction.UPDATE,
      entityType: 'Coupon',
      entityId: id,
      before: { isActive: before.isActive },
      after: { isActive: false },
    });
    return coupon;
  }

  /** Redemption history for one coupon — who used it and what it cost us. */
  async couponRedemptions(id: string) {
    return this.prisma.couponRedemption.findMany({
      where: { couponId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { organization: { select: { id: true, name: true, slug: true } } },
    });
  }
}
