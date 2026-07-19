import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { InstagramAccountsController } from './instagram-accounts.controller';
import { InstagramAccountsService } from './instagram-accounts.service';
import { InstagramTokenMonitorService } from './instagram-token-monitor.service';
import { MetaGraphService } from './meta-graph.service';
import { TokenEncryptionService } from '../../common/services/token-encryption.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [InstagramAccountsController],
  providers: [
    InstagramAccountsService,
    InstagramTokenMonitorService,
    MetaGraphService,
    TokenEncryptionService,
  ],
  exports: [InstagramAccountsService, MetaGraphService],
})
export class InstagramModule {}
