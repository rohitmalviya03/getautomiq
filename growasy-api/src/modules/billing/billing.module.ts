import { Global, Module } from '@nestjs/common';
import { PlanLimitsService } from './plan-limits.service';
import { BillingCycleCron } from './billing-cycle.cron';

/**
 * Plan-limit enforcement + usage reporting. Global so PlanLimitsService can be
 * injected anywhere (Instagram connect, automation-rule create, the usage
 * endpoint, and the FeatureGuard) without every module re-importing it.
 */
@Global()
@Module({
  providers: [PlanLimitsService, BillingCycleCron],
  exports: [PlanLimitsService],
})
export class BillingModule {}
