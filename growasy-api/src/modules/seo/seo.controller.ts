import { Controller, Get, Header, Param, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { SeoService } from './seo.service';

/**
 * Crawler-facing routes. All public, all cacheable, none of them JSON — nginx
 * proxies bot traffic here so search engines and AI answer engines get real HTML
 * instead of the SPA's empty root div. See DEPLOY-VPS.md for the nginx snippet.
 */
@ApiExcludeController()
@Controller({ path: 'seo', version: '1' })
export class SeoController {
  constructor(private readonly seo: SeoService) {}

  @Public()
  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  sitemap() {
    return this.seo.sitemapXml();
  }

  @Public()
  @Get('llms.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  llms() {
    return this.seo.llmsTxt();
  }

  @Public()
  @Get('blog')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  blogIndex() {
    return this.seo.blogIndexHtml();
  }

  /**
   * A single post. An unknown or unpublished slug returns 404 with a small page
   * rather than the SPA shell, so a crawler doesn't index an empty document.
   */
  @Public()
  @Get('blog/:slug')
  @Header('Cache-Control', 'public, max-age=300')
  async blogPost(@Param('slug') slug: string, @Res() res: Response): Promise<void> {
    const html = await this.seo.blogPostHtml(slug);
    res.type('html');
    if (!html) {
      res.status(404).send('<!doctype html><html lang="en"><head><meta name="robots" content="noindex" /><title>Not found</title></head><body><h1>Post not found</h1></body></html>');
      return;
    }
    res.send(html);
  }
}
