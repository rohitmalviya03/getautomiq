import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentOrgId } from '../../common/decorators/current-org.decorator';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { SupportService } from './support.service';
import { CreateTicketDto, ReplyTicketDto } from './dto/support.dto';

/**
 * Customer-facing help centre. Every member of an organization can raise and
 * read that organization's tickets — support is not a permissioned feature, and
 * locking it behind a role would leave a stuck user with no way to ask for help.
 */
@ApiTags('support')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', required: true })
@Controller({ path: 'support/tickets', version: '1' })
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post()
  create(
    @CurrentOrgId() organizationId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateTicketDto,
  ) {
    return this.support.create(organizationId, actor, dto);
  }

  @Get()
  list(@CurrentOrgId() organizationId: string) {
    return this.support.listMine(organizationId);
  }

  @Get(':id')
  detail(@CurrentOrgId() organizationId: string, @Param('id') id: string) {
    return this.support.getForCustomer(organizationId, id);
  }

  @Post(':id/reply')
  @HttpCode(HttpStatus.CREATED)
  reply(
    @CurrentOrgId() organizationId: string,
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: ReplyTicketDto,
  ) {
    return this.support.reply(organizationId, id, actor, dto);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  close(@CurrentOrgId() organizationId: string, @Param('id') id: string) {
    return this.support.close(organizationId, id);
  }
}
