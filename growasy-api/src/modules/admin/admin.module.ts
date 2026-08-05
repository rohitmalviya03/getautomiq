import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminPricingService } from './admin-pricing.service';
import { AdminSupportService } from './admin-support.service';
import { SupportModule } from '../support/support.module';

/**
 * Platform-owner back office. AuthModule is imported for impersonation session
 * minting; PricingService comes from the @Global BillingModule.
 */
@Module({
  imports: [AuthModule, SupportModule],
  controllers: [AdminController],
  providers: [AdminService, AdminPricingService, AdminSupportService],
})
export class AdminModule {}
