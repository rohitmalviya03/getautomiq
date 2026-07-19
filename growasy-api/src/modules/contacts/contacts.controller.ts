import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { ContactsService } from './contacts.service';
import { ListContactsQueryDto } from './dto/list-contacts-query.dto';
import { CurrentOrgId } from '../../common/decorators/current-org.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { PERMISSIONS } from '../../common/constants/permissions.constant';

@ApiTags('contacts')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', description: 'Active organization id', required: true })
@Controller({ path: 'contacts', version: '1' })
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CONTACT_READ)
  list(@CurrentOrgId() organizationId: string, @Query() query: ListContactsQueryDto) {
    return this.contactsService.list(organizationId, query);
  }

  // Must precede ':id' so "export.csv" isn't captured as an id param.
  @Get('export.csv')
  @RequirePermissions(PERMISSIONS.CONTACT_EXPORT)
  @RawResponse() // stream raw CSV, not the JSON envelope
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="contacts.csv"')
  exportCsv(
    @CurrentOrgId() organizationId: string,
    @Query('instagramAccountId') instagramAccountId?: string,
  ) {
    return this.contactsService.exportCsv(organizationId, instagramAccountId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CONTACT_READ)
  findOne(@CurrentOrgId() organizationId: string, @Param('id') id: string) {
    return this.contactsService.findById(organizationId, id);
  }
}
