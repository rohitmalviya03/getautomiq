import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { LinksService } from './links.service';
import { CreateLinkDto } from './dto/create-link.dto';
import { UpdateLinkDto } from './dto/update-link.dto';
import { CurrentOrgId } from '../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions.constant';

@ApiTags('links')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', description: 'Active organization id', required: true })
@Controller({ path: 'links', version: '1' })
export class LinksController {
  constructor(private readonly linksService: LinksService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.LINK_READ)
  list(
    @CurrentOrgId() organizationId: string,
    @Query('instagramAccountId') instagramAccountId?: string,
  ) {
    return this.linksService.list(organizationId, instagramAccountId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.LINK_WRITE)
  create(
    @CurrentOrgId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateLinkDto,
  ) {
    return this.linksService.create(organizationId, userId, dto);
  }

  @Get(':id/stats')
  @RequirePermissions(PERMISSIONS.LINK_READ)
  stats(
    @CurrentOrgId() organizationId: string,
    @Param('id') id: string,
    @Query('days') days?: string,
  ) {
    return this.linksService.stats(organizationId, id, days ? Number(days) : undefined);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.LINK_READ)
  findOne(@CurrentOrgId() organizationId: string, @Param('id') id: string) {
    return this.linksService.findById(organizationId, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.LINK_WRITE)
  update(
    @CurrentOrgId() organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLinkDto,
  ) {
    return this.linksService.update(organizationId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.LINK_DELETE)
  remove(@CurrentOrgId() organizationId: string, @Param('id') id: string) {
    return this.linksService.remove(organizationId, id);
  }
}
