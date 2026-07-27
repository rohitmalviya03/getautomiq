import { Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentOrgId } from '../../common/decorators/current-org.decorator';

@ApiTags('notifications')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', description: 'Active organization id', required: true })
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser('id') userId: string,
    @CurrentOrgId() organizationId: string,
    @Query('limit') limit?: string,
  ) {
    return this.notifications.list(userId, organizationId, limit ? Number(limit) : undefined);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser('id') userId: string, @CurrentOrgId() organizationId: string) {
    return this.notifications.unreadCount(userId, organizationId);
  }

  @Patch(':id/read')
  markRead(
    @CurrentUser('id') userId: string,
    @CurrentOrgId() organizationId: string,
    @Param('id') id: string,
  ) {
    return this.notifications.markRead(userId, organizationId, id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(@CurrentUser('id') userId: string, @CurrentOrgId() organizationId: string) {
    return this.notifications.markAllRead(userId, organizationId);
  }
}
