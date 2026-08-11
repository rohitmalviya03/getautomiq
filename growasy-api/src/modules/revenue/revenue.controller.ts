import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { ConversionsService } from './conversions.service';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { RecordConversionDto } from './dto/record-conversion.dto';
import { RevenueReportQueryDto } from './dto/revenue-report-query.dto';
import { CurrentOrgId } from '../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { PERMISSIONS } from '../../common/constants/permissions.constant';
import { PLAN_FEATURES } from '../../common/constants/plan-features.constant';

/** Dashboard-facing revenue attribution. The storefront-facing half is in
 * PublicConversionsController, which authenticates with an API key instead. */
@ApiTags('revenue')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', description: 'Active organization id', required: true })
@Controller({ path: 'revenue', version: '1' })
export class RevenueController {
  constructor(
    private readonly conversions: ConversionsService,
    private readonly apiKeys: ApiKeysService,
  ) {}

  @Get('report')
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  @RequireFeature(PLAN_FEATURES.REVENUE_ATTRIBUTION)
  report(@CurrentOrgId() organizationId: string, @Query() query: RevenueReportQueryDto) {
    return this.conversions.report(organizationId, query.days);
  }

  @Get('conversions')
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  @RequireFeature(PLAN_FEATURES.REVENUE_ATTRIBUTION)
  list(@CurrentOrgId() organizationId: string, @Query('limit') limit?: string) {
    return this.conversions.list(organizationId, limit ? Number(limit) : undefined);
  }

  /** Mark a contact as having bought, for creators with nothing to integrate. */
  @Post('conversions')
  @RequirePermissions(PERMISSIONS.CONTACT_WRITE)
  @RequireFeature(PLAN_FEATURES.REVENUE_ATTRIBUTION)
  create(@CurrentOrgId() organizationId: string, @Body() dto: RecordConversionDto) {
    const { contactId, ...rest } = dto;
    // Without a contact id we fall through to the same email lookup the API path
    // uses — the dashboard form asks for the buyer's email, which is what the
    // creator actually has to hand.
    if (!contactId) {
      return this.conversions.record(organizationId, 'MANUAL', dto);
    }
    return this.conversions.recordManual(organizationId, contactId, rest);
  }

  @Delete('conversions/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.CONTACT_WRITE)
  @RequireFeature(PLAN_FEATURES.REVENUE_ATTRIBUTION)
  remove(@CurrentOrgId() organizationId: string, @Param('id') id: string) {
    return this.conversions.remove(organizationId, id);
  }

  // ---- API keys ----

  @Get('api-keys')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @RequireFeature(PLAN_FEATURES.API_ACCESS)
  listKeys(@CurrentOrgId() organizationId: string) {
    return this.apiKeys.list(organizationId);
  }

  @Post('api-keys')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @RequireFeature(PLAN_FEATURES.API_ACCESS)
  createKey(
    @CurrentOrgId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.apiKeys.create(organizationId, userId, dto.name);
  }

  @Delete('api-keys/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @RequireFeature(PLAN_FEATURES.API_ACCESS)
  revokeKey(@CurrentOrgId() organizationId: string, @Param('id') id: string) {
    return this.apiKeys.revoke(organizationId, id);
  }
}
