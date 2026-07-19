import { Module } from '@nestjs/common';
import { AutomationRulesService } from './automation-rules.service';
import { AutomationRulesController } from './automation-rules.controller';

/**
 * Automation rule CRUD only. The execution engine (webhook processing + DM
 * sending) lives in growasy-worker — this module just owns the rules that the
 * worker reads. See API_CONTRACT.md for the queue seam between the two.
 */
@Module({
  controllers: [AutomationRulesController],
  providers: [AutomationRulesService],
})
export class AutomationModule {}
