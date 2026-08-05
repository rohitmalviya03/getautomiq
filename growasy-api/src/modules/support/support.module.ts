import { Module } from '@nestjs/common';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

/**
 * Help centre. The customer side lives here; the admin queue is exposed through
 * AdminModule (SuperAdminGuard) but reuses SupportService for shaping, so both
 * sides agree on what a ticket looks like.
 */
@Module({
  controllers: [SupportController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
