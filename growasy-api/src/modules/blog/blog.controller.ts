import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { BlogService } from './blog.service';
import { BlogListQueryDto } from './dto/blog.dto';

/**
 * Public blog. Unauthenticated by design — these pages exist to be found by
 * search engines and read by people who have never signed up.
 *
 * Only PUBLISHED, non-deleted posts with a publishedAt in the past are reachable;
 * drafts are filtered at the query, not in the response shaping.
 */
@ApiTags('blog')
@Controller({ path: 'blog', version: '1' })
export class BlogController {
  constructor(private readonly blog: BlogService) {}

  @Public()
  @Get()
  list(@Query() query: BlogListQueryDto) {
    return this.blog.listPublished(query);
  }

  /** Slugs for the sitemap. Kept above :slug so it isn't swallowed as one. */
  @Public()
  @Get('sitemap')
  sitemap() {
    return this.blog.listPublishedSlugs();
  }

  @Public()
  @Get(':slug')
  detail(@Param('slug') slug: string) {
    return this.blog.getPublishedBySlug(slug);
  }
}
