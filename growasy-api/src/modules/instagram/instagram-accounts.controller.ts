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
import { ApiBearerAuth, ApiHeader, ApiQuery, ApiTags } from '@nestjs/swagger';
import { InstagramAccountsService } from './instagram-accounts.service';
import { OAuthCallbackDto } from './dto/oauth-callback.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentOrgId } from '../../common/decorators/current-org.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions.constant';

@ApiTags('instagram')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', description: 'Active organization id', required: true })
@Controller({ path: 'instagram', version: '1' })
export class InstagramAccountsController {
  constructor(private readonly accountsService: InstagramAccountsService) {}

  @Get('oauth/url')
  @RequirePermissions(PERMISSIONS.INSTAGRAM_ACCOUNT_CONNECT)
  @ApiQuery({
    name: 'accountId',
    required: false,
    description: 'Reconnect an existing account — re-authorizes the same Instagram identity',
  })
  getOAuthUrl(
    @CurrentOrgId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Query('accountId') accountId?: string,
  ) {
    return this.accountsService.getAuthorizationUrl(organizationId, userId, accountId);
  }

  @Post('oauth/callback')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.INSTAGRAM_ACCOUNT_CONNECT)
  handleCallback(
    @CurrentOrgId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: OAuthCallbackDto,
  ) {
    return this.accountsService.handleOAuthCallback(organizationId, userId, dto.code, dto.state);
  }

  @Get('accounts')
  @RequirePermissions(PERMISSIONS.INSTAGRAM_ACCOUNT_READ)
  listAccounts(@CurrentOrgId() organizationId: string) {
    return this.accountsService.listForOrganization(organizationId);
  }

  @Get('accounts/:id')
  @RequirePermissions(PERMISSIONS.INSTAGRAM_ACCOUNT_READ)
  getAccount(@CurrentOrgId() organizationId: string, @Param('id') accountId: string) {
    return this.accountsService.findById(organizationId, accountId);
  }

  @Delete('accounts/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.INSTAGRAM_ACCOUNT_DISCONNECT)
  async disconnect(@CurrentOrgId() organizationId: string, @Param('id') accountId: string) {
    await this.accountsService.disconnect(organizationId, accountId);
    return { disconnected: true };
  }

  @Post('accounts/:id/sync')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.INSTAGRAM_ACCOUNT_READ)
  syncProfile(@CurrentOrgId() organizationId: string, @Param('id') accountId: string) {
    return this.accountsService.syncProfile(organizationId, accountId);
  }

  @Get('accounts/:id/media')
  @RequirePermissions(PERMISSIONS.INSTAGRAM_ACCOUNT_READ)
  listMedia(@CurrentOrgId() organizationId: string, @Param('id') accountId: string) {
    return this.accountsService.listMedia(organizationId, accountId);
  }
}
