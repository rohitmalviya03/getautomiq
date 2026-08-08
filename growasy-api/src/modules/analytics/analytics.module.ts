import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { TrafficController } from './traffic.controller';
import { TrafficService } from './traffic.service';
import { TrafficRetentionCron } from './traffic-retention.cron';

/**
 * Two different analytics: AnalyticsService answers "how are this customer's
 * automations performing", TrafficService answers "who is visiting the product".
 * TrafficService is exported so the admin console can read the traffic metrics.
 */
@Module({
  controllers: [AnalyticsController, TrafficController],
  providers: [AnalyticsService, TrafficService, TrafficRetentionCron],
  exports: [TrafficService],
})
export class AnalyticsModule {}
