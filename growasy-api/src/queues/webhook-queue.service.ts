import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { AppConfigService } from '../config/app-config.service';
import {
  ProcessInstagramCommentJob,
  ProcessInstagramMessageJob,
  QUEUE_NAMES,
  WEBHOOK_JOB_NAMES,
} from './queue-names.constant';

/**
 * Producer for the `webhook-processing` queue. The consumer (a Worker) lives in
 * the AutomationModule and runs in-process — co-located for now, but the queue
 * boundary makes it trivial to move to a standalone worker service later.
 */
@Injectable()
export class WebhookQueueService implements OnModuleDestroy {
  private readonly queue: Queue;

  constructor(config: AppConfigService) {
    this.queue = new Queue(QUEUE_NAMES.WEBHOOK_PROCESSING, {
      connection: config.redis,
      defaultJobOptions: {
        attempts: 4,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
  }

  async enqueueComment(payload: ProcessInstagramCommentJob) {
    await this.queue.add(WEBHOOK_JOB_NAMES.PROCESS_INSTAGRAM_COMMENT, payload, {
      // Queue-level dedup: one job per comment id, so Meta's duplicate/retried
      // deliveries collapse to a single processing job.
      jobId: `wh-${payload.commentId}`,
    });
  }

  async enqueueMessage(payload: ProcessInstagramMessageJob) {
    await this.queue.add(WEBHOOK_JOB_NAMES.PROCESS_INSTAGRAM_MESSAGE, payload, {
      jobId: `wh-msg-${payload.messageId}`,
    });
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
