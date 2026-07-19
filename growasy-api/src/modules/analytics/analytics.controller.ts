import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { CurrentOrgId } from '../../common/decorators/current-org.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions.constant';

@ApiTags('analytics')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', description: 'Active organization id', required: true })
@Controller({ path: 'analytics', version: '1' })
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  // Membership + permission validated by the guard. Not feature-gated so it's
  // usable on any tier; add @RequireFeature(PLAN_FEATURES.ANALYTICS) to lock it
  // to Professional+ later.
  @Get('overview')
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  @ApiQuery({ name: 'days', required: false, description: 'Lookback window (default 30, max 90)' })
  overview(@CurrentOrgId() organizationId: string, @Query('days') days?: string) {
    const parsed = Number(days);
    const rangeDays = Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 1), 90) : 30;
    return this.analyticsService.getOverview(organizationId, rangeDays);
  }
}
