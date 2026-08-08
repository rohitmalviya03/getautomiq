import { Module } from '@nestjs/common';
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';

/**
 * Marketing blog. The public reader lives here; authoring is exposed through
 * AdminModule (SuperAdminGuard) but reuses BlogService, so both sides agree on
 * slugs, reading time and what "published" means.
 */
@Module({
  controllers: [BlogController],
  providers: [BlogService],
  exports: [BlogService],
})
export class BlogModule {}
