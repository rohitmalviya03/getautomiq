import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConversionsService } from './conversions.service';
import { ApiKeyGuard, type ApiKeyRequest } from './api-key.guard';
import { RecordConversionDto } from './dto/record-conversion.dto';
import { Public } from '../../common/decorators/public.decorator';

/**
 * `POST /api/v1/public/conversions` — where the creator's storefront reports a
 * sale. Marked @Public so the JWT guard stands down, then re-authenticated by
 * ApiKeyGuard: this is a server-to-server route, not an open one.
 */
@ApiTags('public-api')
@Controller({ path: 'public', version: '1' })
export class PublicConversionsController {
  constructor(private readonly conversions: ConversionsService) {}

  @Public()
  @UseGuards(ApiKeyGuard)
  @Post('conversions')
  @HttpCode(HttpStatus.OK)
  async record(@Req() req: ApiKeyRequest, @Body() dto: RecordConversionDto) {
    // The organization comes from the key, never from the request body — a key
    // must not be able to write revenue into a workspace it doesn't belong to.
    const result = await this.conversions.record(req.apiKeyOrganizationId, 'API', dto);
    return result;
  }
}
