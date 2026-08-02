import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OrgPlanTier } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RazorpayService } from './razorpay.service';
import { PricingService } from './pricing.service';
import type { BillingCycleInput } from './pricing.service';

// Re-exported for the callers that imported it from here before pricing moved out.
export type { BillingCycleInput };

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpay: RazorpayService,
    private readonly pricing: PricingService,
  ) {}

  /** Whether online payments are live (keys set) + the publishable key for Checkout. */
  getConfig(): { enabled: boolean; keyId: string } {
    return { enabled: this.razorpay.isConfigured(), keyId: this.razorpay.keyId };
  }

  /**
   * Cancels at the end of the current paid period — the customer keeps access until
   * then, and the daily billing cron lapses them to Free afterward. No refund.
   */
  async cancelSubscription(organizationId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    });
    if (!sub) throw new NotFoundException('No active subscription to cancel.');
    if (sub.plan.tier === OrgPlanTier.FREE) {
      throw new BadRequestException('You are on the Free plan — nothing to cancel.');
    }

    const updated = await this.prisma.subscription.update({
      where: { organizationId },
      data: { cancelAtPeriodEnd: true },
      select: { cancelAtPeriodEnd: true, currentPeriodEnd: true },
    });

    try {
      const org = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { ownerId: true },
      });
      if (org?.ownerId) {
        await this.prisma.notification.create({
          data: {
            organizationId,
            userId: org.ownerId,
            type: 'BILLING',
            title: 'Your plan will not renew',
            body: `You'll keep ${sub.plan.name} until ${updated.currentPeriodEnd.toDateString()}, then move to Free.`,
            metadata: JSON.stringify({ reason: 'subscription_canceled' }),
          },
        });
      }
    } catch (e) {
      this.logger.warn(`cancel notification failed for org ${organizationId}: ${String(e)}`);
    }
    return updated;
  }

  /** User chose to stay on Free — clear the pending-payment prompt. */
  async dismissPendingPlan(organizationId: string): Promise<{ cleared: boolean }> {
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { pendingPlanTier: null, pendingBillingCycle: null },
    });
    return { cleared: true };
  }

  /**
   * Price preview for the billing page — the same computation checkout uses, so
   * what the customer is shown is exactly what they will be charged. Coupon
   * problems surface here as a 400 with a customer-facing message.
   */
  async getQuote(
    organizationId: string,
    plan: OrgPlanTier,
    cycle: BillingCycleInput,
    couponCode?: string,
  ) {
    const q = await this.pricing.quote(organizationId, plan, cycle, couponCode);
    return {
      tier: q.tier,
      planName: q.planName,
      cycle: q.cycle,
      currency: q.currency,
      listPrice: q.listPrice,
      promo: q.promo,
      coupon: q.coupon,
      totalDiscount: q.totalDiscount,
      amountDue: q.amountDue,
      free: q.free,
    };
  }

  /** Creates a Razorpay order for the chosen plan + cycle (discounts applied). */
  async createCheckout(
    organizationId: string,
    userId: string,
    plan: OrgPlanTier,
    cycle: BillingCycleInput,
    couponCode?: string,
  ) {
    const q = await this.pricing.quote(organizationId, plan, cycle, couponCode);

    // Discounts wiped the price out. Razorpay won't create an order below ₹1, so
    // activate directly and record a ₹0 payment for the audit trail.
    if (q.free) {
      const syntheticId = `free_${organizationId.slice(0, 8)}_${Date.now().toString(36)}`;
      const planName = await this.activatePlan(organizationId, plan, cycle, syntheticId, {
        amount: 0,
        couponId: q.couponRow?.id ?? null,
        userId,
        amountBefore: q.listPrice,
        method: 'discount_100',
      });
      return {
        free: true as const,
        planName,
        amount: 0,
        currency: q.currency,
        cycle,
        totalDiscount: q.totalDiscount,
      };
    }

    // Razorpay caps `receipt` at 40 chars; a full org UUID (36) blows past it, so
    // use a short prefix + base36 timestamp. The full ids live in `notes` (which
    // activation reads), so the receipt only needs to be a human-scannable ref.
    const receipt = `o_${organizationId.slice(0, 8)}_${Date.now().toString(36)}`;
    const order = await this.razorpay.createOrder(q.amountDue, receipt, {
      organizationId,
      userId,
      plan,
      cycle,
      ...(q.coupon ? { couponCode: q.coupon.code } : {}),
    });

    // Park the server-computed amount + coupon against the order id. Activation
    // reads this row, so the browser can never talk us into a different price or
    // claim a coupon it didn't actually check out with.
    await this.prisma.payment.create({
      data: {
        organizationId,
        amount: q.amountDue,
        currency: q.currency,
        status: 'PENDING',
        method: 'razorpay',
        externalOrderId: order.id,
        couponId: q.couponRow?.id ?? null,
      },
    });

    return {
      free: false as const,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: this.razorpay.keyId,
      planName: q.planName,
      cycle,
      listPrice: q.listPrice,
      totalDiscount: q.totalDiscount,
      coupon: q.coupon,
      promo: q.promo,
    };
  }

  /** Verifies the checkout callback signature and activates the plan. */
  async verifyAndActivate(
    organizationId: string,
    payload: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
      plan: OrgPlanTier;
      cycle: BillingCycleInput;
    },
  ) {
    const ok = this.razorpay.verifyPaymentSignature(
      payload.razorpay_order_id,
      payload.razorpay_payment_id,
      payload.razorpay_signature,
    );
    if (!ok) {
      throw new ForbiddenException('Payment could not be verified.');
    }
    const planName = await this.activatePlan(
      organizationId,
      payload.plan,
      payload.cycle,
      payload.razorpay_payment_id,
      { orderId: payload.razorpay_order_id },
    );
    return { success: true, plan: planName };
  }

  /** Razorpay webhook — safety net if the browser never calls verify. */
  async handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<void> {
    if (!signature || !this.razorpay.verifyWebhookSignature(rawBody, signature)) {
      this.logger.warn('razorpay webhook: bad or missing signature — ignoring');
      return;
    }
    let body: WebhookBody;
    try {
      body = JSON.parse(rawBody.toString('utf8')) as WebhookBody;
    } catch {
      return;
    }

    // order.paid carries the order entity (with our notes) — the reliable path.
    if (body.event === 'order.paid') {
      const notes = body.payload?.order?.entity?.notes;
      const paymentId = body.payload?.payment?.entity?.id;
      if (notes?.organizationId && notes.plan && paymentId) {
        await this.activatePlan(
          notes.organizationId,
          notes.plan as OrgPlanTier,
          (notes.cycle as BillingCycleInput) ?? 'monthly',
          paymentId,
          {
            orderId: body.payload?.order?.entity?.id,
            userId: notes.userId ?? null,
          },
        );
      }
      return;
    }

    // Observability for failed charges — no activation, just a log (the browser
    // flow already surfaces failures to the user in real time).
    if (body.event === 'payment.failed') {
      const p = body.payload?.payment?.entity;
      this.logger.warn(
        { paymentId: p?.id, org: p?.notes?.organizationId },
        'razorpay payment.failed',
      );
    }
  }

  /**
   * Idempotently activates a plan on the org's subscription and records the
   * payment + invoice. Safe to call from both verify and the webhook — a
   * duplicate payment id is a no-op.
   */
  private async activatePlan(
    organizationId: string,
    plan: OrgPlanTier,
    cycle: BillingCycleInput,
    paymentId: string,
    charge?: {
      /** Razorpay order id — resolves the PENDING payment holding the real amount. */
      orderId?: string | null;
      amount?: number;
      amountBefore?: number;
      couponId?: string | null;
      userId?: string | null;
      method?: string;
    },
  ): Promise<string> {
    const existing = await this.prisma.payment.findFirst({
      where: { externalPaymentId: paymentId, status: 'SUCCEEDED' },
      select: { id: true },
    });
    if (existing) {
      const sub = await this.prisma.subscription.findUnique({
        where: { organizationId },
        include: { plan: true },
      });
      return sub?.plan.name ?? plan;
    }

    const planRow = await this.prisma.plan.findFirst({ where: { tier: plan, isActive: true } });
    if (!planRow) throw new NotFoundException('Plan not found.');

    // The PENDING row written at checkout is the authority on what was charged
    // and which coupon was used. Fall back to the list price for orders created
    // before this existed (or a webhook that arrives with no matching row).
    const pending = charge?.orderId
      ? await this.prisma.payment.findFirst({
          where: { externalOrderId: charge.orderId, status: 'PENDING' },
        })
      : null;

    const listPrice = cycle === 'yearly' ? planRow.yearlyPrice : planRow.monthlyPrice;
    const amount = pending?.amount ?? charge?.amount ?? listPrice;
    const couponId = pending?.couponId ?? charge?.couponId ?? null;
    const now = new Date();
    const days = cycle === 'yearly' ? 365 : 30;
    const periodEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const billingCycle = cycle === 'yearly' ? 'YEARLY' : 'MONTHLY';

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.upsert({
        where: { organizationId },
        update: {
          planId: planRow.id,
          status: 'ACTIVE',
          billingCycle,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
        },
        create: {
          organizationId,
          planId: planRow.id,
          status: 'ACTIVE',
          billingCycle,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });

      // Payment done → clear any "complete payment" prompt for this org.
      await tx.organization.update({
        where: { id: organizationId },
        data: { pendingPlanTier: null, pendingBillingCycle: null },
      });

      // Settle the PENDING row from checkout when there is one, so a checkout
      // never leaves an orphan PENDING payment behind.
      const payment = pending
        ? await tx.payment.update({
            where: { id: pending.id },
            data: {
              status: 'SUCCEEDED',
              externalPaymentId: paymentId,
              method: charge?.method ?? 'razorpay',
              paidAt: now,
            },
          })
        : await tx.payment.create({
            data: {
              organizationId,
              amount,
              currency: 'INR',
              status: 'SUCCEEDED',
              method: charge?.method ?? 'razorpay',
              externalPaymentId: paymentId,
              externalOrderId: charge?.orderId ?? null,
              couponId,
              paidAt: now,
            },
          });

      // Record the coupon redemption. The unique (couponId, externalPaymentId)
      // plus skipDuplicates makes this idempotent, so verify and the webhook —
      // which both land here — can never double-count one redemption.
      if (couponId) {
        const created = await tx.couponRedemption.createMany({
          data: [
            {
              couponId,
              organizationId,
              userId: charge?.userId ?? null,
              externalPaymentId: paymentId,
              amountBefore: charge?.amountBefore ?? listPrice,
              amountAfter: amount,
              discountAmount: Math.max(0, (charge?.amountBefore ?? listPrice) - amount),
            },
          ],
          skipDuplicates: true,
        });
        if (created.count > 0) {
          await tx.coupon.update({
            where: { id: couponId },
            data: { redeemedCount: { increment: 1 } },
          });
        }
      }

      await tx.invoice.create({
        data: {
          organizationId,
          invoiceNumber: `INV-${now.getFullYear()}-${payment.id.slice(0, 8)}`,
          amount,
          currency: 'INR',
          status: 'PAID',
          issuedAt: now,
          paidAt: now,
        },
      });
    });

    // Best-effort receipt notification (never blocks activation).
    try {
      const owner = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { ownerId: true },
      });
      if (owner?.ownerId) {
        await this.prisma.notification.create({
          data: {
            organizationId,
            userId: owner.ownerId,
            type: 'BILLING',
            title: `You're on the ${planRow.name} plan 🎉`,
            body: `Payment received. Your ${cycle} plan is active until ${periodEnd.toDateString()}.`,
            metadata: JSON.stringify({ reason: 'payment_success', paymentId }),
          },
        });
      }
    } catch (e) {
      this.logger.warn(`payment notification failed for org ${organizationId}: ${String(e)}`);
    }

    return planRow.name;
  }
}

interface WebhookBody {
  event: string;
  payload?: {
    // `order.entity.id` is the Razorpay order id — it resolves the PENDING
    // Payment row holding the server-computed amount and coupon for this checkout.
    order?: { entity?: { id?: string; notes?: Record<string, string> } };
    payment?: { entity?: { id?: string; notes?: Record<string, string> } };
  };
}
