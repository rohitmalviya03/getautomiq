import { Global, Module } from '@nestjs/common';
import { MailQueueService } from './mail-queue.service';
import { WebhookQueueService } from './webhook-queue.service';

@Global()
@Module({
  providers: [MailQueueService, WebhookQueueService],
  exports: [MailQueueService, WebhookQueueService],
})
export class QueuesModule {}
