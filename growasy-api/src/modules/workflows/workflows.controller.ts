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
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { WorkflowStatus } from '@prisma/client';
import { WorkflowsService } from './workflows.service';
import { CreateWorkflowDto, SaveGraphDto, UpdateWorkflowDto } from './dto/workflow.dto';
import { CurrentOrgId } from '../../common/decorators/current-org.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { PERMISSIONS } from '../../common/constants/permissions.constant';
import { PLAN_FEATURES } from '../../common/constants/plan-features.constant';

@ApiTags('workflows')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', description: 'Active organization id', required: true })
// Visual workflows are a Growth-and-above feature.
@RequireFeature(PLAN_FEATURES.WORKFLOWS)
@Controller({ path: 'workflows', version: '1' })
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.AUTOMATION_CREATE)
  create(@CurrentOrgId() orgId: string, @Body() dto: CreateWorkflowDto) {
    return this.workflows.create(orgId, dto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.AUTOMATION_READ)
  list(@CurrentOrgId() orgId: string, @Query('instagramAccountId') instagramAccountId?: string) {
    return this.workflows.list(orgId, instagramAccountId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.AUTOMATION_READ)
  findOne(@CurrentOrgId() orgId: string, @Param('id') id: string) {
    return this.workflows.findById(orgId, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.AUTOMATION_UPDATE)
  update(@CurrentOrgId() orgId: string, @Param('id') id: string, @Body() dto: UpdateWorkflowDto) {
    return this.workflows.update(orgId, id, dto);
  }

  @Put(':id/graph')
  @RequirePermissions(PERMISSIONS.AUTOMATION_UPDATE)
  saveGraph(@CurrentOrgId() orgId: string, @Param('id') id: string, @Body() dto: SaveGraphDto) {
    return this.workflows.saveGraph(orgId, id, dto);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.AUTOMATION_UPDATE)
  publish(@CurrentOrgId() orgId: string, @Param('id') id: string) {
    return this.workflows.publish(orgId, id);
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.AUTOMATION_UPDATE)
  pause(@CurrentOrgId() orgId: string, @Param('id') id: string) {
    return this.workflows.setStatus(orgId, id, WorkflowStatus.PAUSED);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.AUTOMATION_DELETE)
  remove(@CurrentOrgId() orgId: string, @Param('id') id: string) {
    return this.workflows.remove(orgId, id);
  }
}
