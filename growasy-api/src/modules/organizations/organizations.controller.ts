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
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentOrgId } from '../../common/decorators/current-org.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions.constant';

@ApiTags('organizations')
@ApiBearerAuth()
@Controller({ path: 'organizations', version: '1' })
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  @Get('me')
  async myOrganizations(@CurrentUser('id') userId: string) {
    return this.organizationsService.listForUser(userId);
  }

  /** Plan usage vs limits for the active org — powers the dashboard usage widget. */
  @Get('me/usage')
  @ApiHeader({ name: 'x-organization-id', description: 'Active organization id', required: true })
  async usage(@CurrentUser('id') userId: string, @CurrentOrgId() organizationId: string) {
    await this.organizationsService.assertMembership(userId, organizationId);
    return this.planLimits.getUsageSummary(organizationId);
  }

  /** Create an additional workspace, owned by the caller (starts on Free). */
  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateOrganizationDto) {
    return this.organizationsService.createForUser(userId, dto.name);
  }

  // --- Team management (scoped to the active org via x-organization-id) ------

  @Get('roles')
  @ApiHeader({ name: 'x-organization-id', required: true })
  listRoles(@CurrentUser('id') userId: string, @CurrentOrgId() organizationId: string) {
    return this.organizationsService.listRoles(userId, organizationId);
  }

  @Get('members')
  @ApiHeader({ name: 'x-organization-id', required: true })
  listMembers(@CurrentUser('id') userId: string, @CurrentOrgId() organizationId: string) {
    return this.organizationsService.listMembers(userId, organizationId);
  }

  @Post('members')
  @ApiHeader({ name: 'x-organization-id', required: true })
  @RequirePermissions(PERMISSIONS.MEMBER_INVITE)
  invite(
    @CurrentUser('id') userId: string,
    @CurrentOrgId() organizationId: string,
    @Body() dto: InviteMemberDto,
  ) {
    return this.organizationsService.inviteMember(userId, organizationId, dto.email, dto.roleSlug);
  }

  @Patch('members/:id')
  @ApiHeader({ name: 'x-organization-id', required: true })
  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  updateRole(
    @CurrentUser('id') userId: string,
    @CurrentOrgId() organizationId: string,
    @Param('id') memberId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.organizationsService.updateMemberRole(
      userId,
      organizationId,
      memberId,
      dto.roleSlug,
    );
  }

  @Delete('members/:id')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'x-organization-id', required: true })
  @RequirePermissions(PERMISSIONS.MEMBER_REMOVE)
  async remove(
    @CurrentUser('id') userId: string,
    @CurrentOrgId() organizationId: string,
    @Param('id') memberId: string,
  ) {
    await this.organizationsService.removeMember(userId, organizationId, memberId);
    return { removed: true };
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @CurrentUser('id') userId: string) {
    await this.organizationsService.assertMembership(userId, id);
    return this.organizationsService.findById(id);
  }
}
