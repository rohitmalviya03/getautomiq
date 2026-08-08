import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { TrafficService } from './traffic.service';

export class TrackPageViewDto {
  @IsString()
  @MaxLength(500)
  path!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  referrer?: string;
}

/**
 * Page-view beacon. Public because the marketing site and the free tools are
 * visited signed-out — that traffic is the whole point of measuring.
 *
 * Everything identifying is derived server-side (IP and user agent never leave
 * this request), so a caller can't spoof a country or forge someone else's
 * visitor id by sending extra fields.
 */
@ApiTags('analytics')
@Controller({ path: 'analytics', version: '1' })
export class TrafficController {
  constructor(private readonly traffic: TrafficService) {}

  @Public()
  @Post('track')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiExcludeEndpoint()
  async track(@Body() dto: TrackPageViewDto, @Req() req: Request): Promise<void> {
    // A signed-in visitor is attributed to their user; the JwtAuthGuard is
    // skipped by @Public, so read whatever it left on the request without
    // requiring it.
    const user = (req as Request & { user?: { id?: string } }).user;

    await this.traffic.track({
      path: dto.path,
      referrer: dto.referrer ?? req.headers.referer ?? null,
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      // Set by Cloudflare/most CDNs. Absent behind plain nginx — country is then
      // simply unknown rather than guessed.
      country: (req.headers['cf-ipcountry'] as string | undefined) ?? null,
      userId: user?.id ?? null,
      organizationId: (req.headers['x-organization-id'] as string | undefined) ?? null,
    });
  }
}
