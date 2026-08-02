import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Coupon, DiscountType, OrgPlanTier, Plan } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanLimits } from './plan-limits.service';

/** Billing cycles the checkout accepts. */
export type BillingCycleInput = 'monthly' | 'yearly';

/** Tiers a customer can buy themselves. FREE is free; AGENCY/ENTERPRISE are sales-led. */
export const PURCHASABLE_TIERS: OrgPlanTier[] = [
  OrgPlanTier.STARTER,
  OrgPlanTier.GROWTH,
  OrgPlanTier.PROFESSIONAL,
];

/**
 * Razorpay rejects orders below ₹1. A discount that lands between ₹0 and ₹1 is
 * therefore unchargeable — we treat anything at or below this as "free" and
 * activate without a payment rather than fail the checkout.
 */
export const MIN_CHARGEABLE_PAISE = 100;

export interface DiscountLine {
  type: DiscountType;
  value: number;
  amount: number; // paise taken off
  label: string;
}

/** What a given (plan, cycle, coupon?) actually costs, broken down. */
export interface PriceQuote {
  tier: OrgPlanTier;
  planName: string;
  cycle: BillingCycleInput;
  currency: string;
  listPrice: number; // paise before any discount
  promo: DiscountLine | null; // always-on plan promo
  coupon: (DiscountLine & { code: string }) | null;
  totalDiscount: number;
  amountDue: number; // paise actually charged
  /** True when discounts wiped the price out — activate without charging. */
  free: boolean;
}

/** Public catalogue entry — what the storefront renders. */
export interface PublicPlan {
  tier: OrgPlanTier;
  name: string;
  tag: string;
  subtitle: string | null;
  ctaLabel: string | null;
  inheritsLabel: string | null;
  isPopular: boolean;
  isBestValue: boolean;
  contactSales: boolean;
  purchasable: boolean;
  sortOrder: number;
  currency: string;
  features: string[];
  limits: PlanLimits | null;
  monthly: CyclePrice;
  yearly: CyclePrice;
}

export interface CyclePrice {
  listPrice: number;
  amountDue: number;
  discount: number;
  promoLabel: string | null;
}

/**
 * What the admin console edits: the public shape plus the raw promo columns and
 * the visibility flags. Never returned from the public endpoint.
 */
export interface AdminPlan extends PublicPlan {
  id: string;
  isActive: boolean;
  isPublic: boolean;
  promoType: DiscountType | null;
  promoValue: number | null;
  promoLabel: string | null;
  promoStartsAt: string | null;
  promoEndsAt: string | null;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Applies one discount to an amount. PERCENT rounds to the nearest paisa; the
 * result is always clamped into [0, amount] so a bad admin value (150%, a flat
 * discount larger than the price) can never produce a negative charge.
 */
function applyDiscount(amount: number, type: DiscountType, value: number): number {
  if (amount <= 0 || value <= 0) return 0;
  const off = type === DiscountType.PERCENT ? Math.round((amount * value) / 100) : value;
  return Math.max(0, Math.min(amount, off));
}

/**
 * Pricing is computed here and nowhere else. The storefront, the checkout and
 * the admin console all read through this service, so an admin price change is
 * live everywhere at once — and, more importantly, the amount the browser is
 * shown is recomputed server-side before the Razorpay order is created.
 */
@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Whether a plan's promo window covers `now`. */
  private promoActive(plan: Plan, now: Date): boolean {
    if (!plan.promoType || !plan.promoValue || plan.promoValue <= 0) return false;
    if (plan.promoStartsAt && now < plan.promoStartsAt) return false;
    if (plan.promoEndsAt && now > plan.promoEndsAt) return false;
    return true;
  }

  private cyclePrice(plan: Plan, cycle: BillingCycleInput, now: Date): CyclePrice {
    const listPrice = cycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
    if (!this.promoActive(plan, now)) {
      return { listPrice, amountDue: listPrice, discount: 0, promoLabel: null };
    }
    const discount = applyDiscount(listPrice, plan.promoType!, plan.promoValue!);
    return {
      listPrice,
      amountDue: listPrice - discount,
      discount,
      promoLabel: plan.promoLabel ?? null,
    };
  }

  private toPublic(plan: Plan, now: Date): PublicPlan {
    return {
      tier: plan.tier,
      name: plan.name,
      tag: plan.tag ?? plan.name,
      subtitle: plan.subtitle,
      ctaLabel: plan.ctaLabel,
      inheritsLabel: plan.inheritsLabel,
      isPopular: plan.isPopular,
      isBestValue: plan.isBestValue,
      contactSales: plan.contactSales,
      purchasable: PURCHASABLE_TIERS.includes(plan.tier) && !plan.contactSales,
      sortOrder: plan.sortOrder,
      currency: plan.currency,
      features: parseJson<string[]>(plan.features, []),
      limits: parseJson<PlanLimits | null>(plan.limits, null),
      monthly: this.cyclePrice(plan, 'monthly', now),
      yearly: this.cyclePrice(plan, 'yearly', now),
    };
  }

  /** The public pricing catalogue (GET /plans). Hidden/inactive plans excluded. */
  async listPublicPlans(): Promise<PublicPlan[]> {
    const now = new Date();
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true, isPublic: true },
      orderBy: [{ sortOrder: 'asc' }, { monthlyPrice: 'asc' }],
    });
    return plans.map((p) => this.toPublic(p, now));
  }

  /** Every plan including hidden/inactive ones, with the editable promo columns. */
  async listAllPlans(): Promise<AdminPlan[]> {
    const now = new Date();
    const plans = await this.prisma.plan.findMany({
      orderBy: [{ sortOrder: 'asc' }, { monthlyPrice: 'asc' }],
    });
    return plans.map((p) => ({
      ...this.toPublic(p, now),
      id: p.id,
      isActive: p.isActive,
      isPublic: p.isPublic,
      promoType: p.promoType,
      promoValue: p.promoValue,
      promoLabel: p.promoLabel,
      promoStartsAt: p.promoStartsAt?.toISOString() ?? null,
      promoEndsAt: p.promoEndsAt?.toISOString() ?? null,
    }));
  }

  /**
   * Validates a coupon for this (tier, cycle, org) and throws a customer-facing
   * message when it doesn't apply. Returns null for an empty code.
   */
  async resolveCoupon(
    code: string | undefined | null,
    tier: OrgPlanTier,
    cycle: BillingCycleInput,
    organizationId: string,
  ): Promise<Coupon | null> {
    const normalized = (code ?? '').trim().toUpperCase();
    if (!normalized) return null;

    const coupon = await this.prisma.coupon.findUnique({ where: { code: normalized } });
    if (!coupon || !coupon.isActive) {
      throw new BadRequestException({
        error: 'COUPON_INVALID',
        message: 'That coupon code is not valid.',
      });
    }

    const now = new Date();
    if (coupon.startsAt && now < coupon.startsAt) {
      throw new BadRequestException({
        error: 'COUPON_NOT_STARTED',
        message: 'This coupon is not active yet.',
      });
    }
    if (coupon.endsAt && now > coupon.endsAt) {
      throw new BadRequestException({
        error: 'COUPON_EXPIRED',
        message: 'This coupon has expired.',
      });
    }

    const tiers = parseJson<string[]>(coupon.appliesToTiers, []);
    if (tiers.length > 0 && !tiers.includes(tier)) {
      throw new BadRequestException({
        error: 'COUPON_TIER_MISMATCH',
        message: 'This coupon does not apply to the selected plan.',
      });
    }

    const cycles = parseJson<string[]>(coupon.appliesToCycles, []);
    if (cycles.length > 0 && !cycles.includes(cycle)) {
      throw new BadRequestException({
        error: 'COUPON_CYCLE_MISMATCH',
        message: `This coupon only applies to ${cycles.join(' / ')} billing.`,
      });
    }

    if (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions) {
      throw new BadRequestException({
        error: 'COUPON_EXHAUSTED',
        message: 'This coupon has been fully redeemed.',
      });
    }

    if (coupon.maxPerOrg > 0) {
      const used = await this.prisma.couponRedemption.count({
        where: { couponId: coupon.id, organizationId },
      });
      if (used >= coupon.maxPerOrg) {
        throw new BadRequestException({
          error: 'COUPON_ALREADY_USED',
          message: 'You have already used this coupon.',
        });
      }
    }

    return coupon;
  }

  /**
   * The authoritative price for a checkout. Order of operations: plan promo
   * first, then the coupon on the already-reduced amount (so a 20% coupon on a
   * ₹100 plan with a 50% promo takes ₹10, not ₹20).
   */
  async quote(
    organizationId: string,
    tier: OrgPlanTier,
    cycle: BillingCycleInput,
    couponCode?: string | null,
  ): Promise<PriceQuote & { plan: Plan; couponRow: Coupon | null }> {
    if (!PURCHASABLE_TIERS.includes(tier)) {
      throw new BadRequestException('That plan is not available for self-serve checkout.');
    }
    const plan = await this.prisma.plan.findFirst({ where: { tier, isActive: true } });
    if (!plan) throw new NotFoundException('Plan not found.');
    if (plan.contactSales) {
      throw new BadRequestException('This plan is sales-led — please contact sales.');
    }

    const now = new Date();
    const cp = this.cyclePrice(plan, cycle, now);
    if (cp.listPrice <= 0) {
      throw new BadRequestException('This plan has no payable amount.');
    }

    const promo: DiscountLine | null =
      cp.discount > 0
        ? {
            type: plan.promoType!,
            value: plan.promoValue!,
            amount: cp.discount,
            label: plan.promoLabel ?? 'Discount',
          }
        : null;

    const couponRow = await this.resolveCoupon(couponCode, tier, cycle, organizationId);
    let couponLine: (DiscountLine & { code: string }) | null = null;
    let amountDue = cp.amountDue;

    if (couponRow) {
      const off = applyDiscount(amountDue, couponRow.type, couponRow.value);
      couponLine = {
        code: couponRow.code,
        type: couponRow.type,
        value: couponRow.value,
        amount: off,
        label: couponRow.description ?? `Coupon ${couponRow.code}`,
      };
      amountDue -= off;
    }

    return {
      tier,
      planName: plan.name,
      cycle,
      currency: plan.currency,
      listPrice: cp.listPrice,
      promo,
      coupon: couponLine,
      totalDiscount: cp.listPrice - amountDue,
      amountDue,
      free: amountDue < MIN_CHARGEABLE_PAISE,
      plan,
      couponRow,
    };
  }
}
