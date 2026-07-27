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

/** Billing cycles the checkout accepts. */
export type BillingCycleInput = 'monthly' | 'yearly';
/** Only these tiers are self-serve purchasable (Free = free, Agency = sales-led). */
const PURCHASABLE: OrgPlanTier[] = [OrgPlanTier.STARTER, OrgPlanTier.GROWTH];

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpay: RazorpayService,
  ) {}

  /** Creates a Razorpay order for the chosen plan + cycle. */
  async createCheckout(
    organizationId: string,
    userId: string,
    plan: OrgPlanTier,
    cycle: BillingCycleInput,
  ) {
    if (!PURCHASABLE.includes(plan)) {
      throw new BadRequestException('That plan is not available for self-serve checkout.');
    }
    const planRow = await this.prisma.plan.findFirst({ where: { tier: plan, isActive: true } });
    if (!planRow) throw new NotFoundException('Plan not found.');

    const amount = cycle === 'yearly' ? planRow.yearlyPrice : planRow.monthlyPrice;
    if (amount <= 0) throw new BadRequestException('This plan has no payable amount.');

    const order = await this.razorpay.createOrder(amount, `org_${organizationId}_${Date.now()}`, {
      organizationId,
      userId,
      plan,
      cycle,
    });

    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: this.razorpay.keyId,
      planName: planRow.name,
      cycle,
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
        );
      }
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

    const amount = cycle === 'yearly' ? planRow.yearlyPrice : planRow.monthlyPrice;
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

      const payment = await tx.payment.create({
        data: {
          organizationId,
          amount,
          currency: 'INR',
          status: 'SUCCEEDED',
          method: 'razorpay',
          externalPaymentId: paymentId,
          paidAt: now,
        },
      });

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
    order?: { entity?: { notes?: Record<string, string> } };
    payment?: { entity?: { id?: string } };
  };
}
