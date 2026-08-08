import { Module } from '@nestjs/common';
import { BlogModule } from '../blog/blog.module';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';

/** Crawler-facing HTML, sitemap and llms.txt. Reads posts through BlogService. */
@Module({
  imports: [BlogModule],
  controllers: [SeoController],
  providers: [SeoService],
})
export class SeoModule {}
