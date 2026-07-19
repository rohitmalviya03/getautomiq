import { Controller, Get, Param, Req, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { LinksService } from './links.service';
import { Public } from '../../common/decorators/public.decorator';

/**
 * Public short-link redirect: `GET /api/l/:slug`. Unauthenticated and
 * unversioned (like the webhook handler). Records the click, then 302-redirects
 * to the destination; unknown/paused slugs get a plain 404.
 */
@ApiExcludeController()
@Controller({ path: 'l', version: VERSION_NEUTRAL })
export class LinksRedirectController {
  constructor(private readonly linksService: LinksService) {}

  @Public()
  @Get(':slug')
  async redirect(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const forwardedFor = req.headers['x-forwarded-for'];
    const ip = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)?.split(',')[0]?.trim();

    const destination = await this.linksService.recordClickAndResolve(slug, {
      ip: ip || req.ip,
      userAgent: req.headers['user-agent'] ?? null,
      referrer: req.headers['referer'] ?? null,
    });

    if (!destination) {
      res.status(404).type('text/plain').send('This link is not available.');
      return;
    }
    // 302 (temporary) so we keep receiving clicks rather than the browser caching
    // a permanent redirect and never hitting us again.
    res.redirect(302, destination);
  }
}
