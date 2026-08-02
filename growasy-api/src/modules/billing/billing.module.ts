import { Global, Module } from '@nestjs/common';
import { PlanLimitsService } from './plan-limits.service';
import { BillingCycleCron } from './billing-cycle.cron';
import { RazorpayService } from './razorpay.service';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PricingService } from './pricing.service';
import { PlansController } from './plans.controller';

/**
 * Plan-limit enforcement + usage reporting + Razorpay payments. Global so
 * PlanLimitsService can be injected anywhere (Instagram connect, automation-rule
 * create, the usage endpoint, and the FeatureGuard) without re-importing.
 */
@Global()
@Module({
  controllers: [PaymentsController, PlansController],
  providers: [PlanLimitsService, BillingCycleCron, RazorpayService, PaymentsService, PricingService],
  // PricingService is exported so the admin module can price-preview plans it edits.
  exports: [PlanLimitsService, PricingService],
})
export class BillingModule {}
