import { Module } from '@nestjs/common';
import { RevenueController } from './revenue.controller';
import { PublicConversionsController } from './public-conversions.controller';
import { ConversionsService } from './conversions.service';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyGuard } from './api-key.guard';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [BillingModule],
  controllers: [RevenueController, PublicConversionsController],
  providers: [ConversionsService, ApiKeysService, ApiKeyGuard],
  exports: [ConversionsService, ApiKeysService],
})
export class RevenueModule {}
