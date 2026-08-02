import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminPricingService } from './admin-pricing.service';

/**
 * Platform-owner back office. AuthModule is imported for impersonation session
 * minting; PricingService comes from the @Global BillingModule.
 */
@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminService, AdminPricingService],
})
export class AdminModule {}
