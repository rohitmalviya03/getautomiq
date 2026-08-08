import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminPricingService } from './admin-pricing.service';
import { AdminSupportService } from './admin-support.service';
import { SupportModule } from '../support/support.module';
import { AnalyticsModule } from '../analytics/analytics.module';

/**
 * Platform-owner back office. AuthModule is imported for impersonation session
 * minting; PricingService comes from the @Global BillingModule.
 */
@Module({
  imports: [AuthModule, SupportModule, AnalyticsModule],
  controllers: [AdminController],
  providers: [AdminService, AdminPricingService, AdminSupportService],
})
export class AdminModule {}
