import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { AutomationRulesService } from './automation-rules.service';
import { CreateAutomationRuleDto } from './dto/create-automation-rule.dto';
import { UpdateAutomationRuleDto } from './dto/update-automation-rule.dto';
import { CurrentOrgId } from '../../common/decorators/current-org.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions.constant';

@ApiTags('automations')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', description: 'Active organization id', required: true })
@Controller({ path: 'automations/rules', version: '1' })
export class AutomationRulesController {
  constructor(private readonly rulesService: AutomationRulesService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.AUTOMATION_CREATE)
  create(@CurrentOrgId() organizationId: string, @Body() dto: CreateAutomationRuleDto) {
    return this.rulesService.create(organizationId, dto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.AUTOMATION_READ)
  list(
    @CurrentOrgId() organizationId: string,
    @Query('instagramAccountId') instagramAccountId?: string,
  ) {
    return this.rulesService.list(organizationId, instagramAccountId);
  }

  // Must precede ':id' so "activity" isn't captured as a rule id.
  @Get('activity')
  @RequirePermissions(PERMISSIONS.AUTOMATION_READ)
  activity(@CurrentOrgId() organizationId: string, @Query('limit') limit?: string) {
    return this.rulesService.listActivity(organizationId, limit ? Number(limit) : undefined);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.AUTOMATION_READ)
  findOne(@CurrentOrgId() organizationId: string, @Param('id') id: string) {
    return this.rulesService.findById(organizationId, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.AUTOMATION_UPDATE)
  update(
    @CurrentOrgId() organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAutomationRuleDto,
  ) {
    return this.rulesService.update(organizationId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.AUTOMATION_DELETE)
  async remove(@CurrentOrgId() organizationId: string, @Param('id') id: string) {
    await this.rulesService.remove(organizationId, id);
    return { deleted: true };
  }
}
