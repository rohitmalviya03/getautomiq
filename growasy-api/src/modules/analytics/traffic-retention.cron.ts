import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PAGEVIEW_RETENTION_DAYS, TrafficService } from './traffic.service';

/**
 * Page views accumulate a row per view, so without a ceiling the table grows
 * without bound. Dashboard queries only ever look back 90 days; anything past
 * the retention window is dropped nightly.
 */
@Injectable()
export class TrafficRetentionCron {
  private readonly logger = new Logger(TrafficRetentionCron.name);

  constructor(private readonly traffic: TrafficService) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM, { name: 'pageview-retention' })
  async prune(): Promise<void> {
    try {
      await this.traffic.pruneOldViews();
    } catch (e) {
      // Never let a retention sweep take the app down.
      this.logger.warn(`page view pruning failed (retention ${PAGEVIEW_RETENTION_DAYS}d): ${String(e)}`);
    }
  }
}
