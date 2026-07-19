import { Module } from '@nestjs/common';
import { LinksController } from './links.controller';
import { LinksRedirectController } from './links-redirect.controller';
import { LinksService } from './links.service';

@Module({
  controllers: [LinksController, LinksRedirectController],
  providers: [LinksService],
  exports: [LinksService],
})
export class LinksModule {}
