import { Global, Module } from '@nestjs/common';
import { PlanLimitsService } from './plan-limits.service';
import { BillingCycleCron } from './billing-cycle.cron';
import { RazorpayService } from './razorpay.service';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';

/**
 * Plan-limit enforcement + usage reporting + Razorpay payments. Global so
 * PlanLimitsService can be injected anywhere (Instagram connect, automation-rule
 * create, the usage endpoint, and the FeatureGuard) without re-importing.
 */
@Global()
@Module({
  controllers: [PaymentsController],
  providers: [PlanLimitsService, BillingCycleCron, RazorpayService, PaymentsService],
  exports: [PlanLimitsService],
})
export class BillingModule {}
