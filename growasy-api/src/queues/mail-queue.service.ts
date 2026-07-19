import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { AppConfigService } from '../config/app-config.service';
import {
  MAIL_JOB_NAMES,
  QUEUE_NAMES,
  SendPasswordResetEmailJob,
  SendVerificationEmailJob,
  SendWelcomeEmailJob,
} from './queue-names.constant';

/**
 * Producer-only client for the `mail` queue. growasy-worker owns the consumer
 * side and is responsible for actually sending mail via SMTP.
 */
@Injectable()
export class MailQueueService implements OnModuleDestroy {
  private readonly queue: Queue;

  constructor(config: AppConfigService) {
    this.queue = new Queue(QUEUE_NAMES.MAIL, {
      connection: config.redis,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
  }

  async sendVerificationEmail(payload: SendVerificationEmailJob) {
    await this.queue.add(MAIL_JOB_NAMES.SEND_VERIFICATION_EMAIL, payload, {
      jobId: `verify-${payload.toEmail}-${Date.now()}`,
    });
  }

  async sendPasswordResetEmail(payload: SendPasswordResetEmailJob) {
    await this.queue.add(MAIL_JOB_NAMES.SEND_PASSWORD_RESET_EMAIL, payload, {
      jobId: `reset-${payload.toEmail}-${Date.now()}`,
    });
  }

  async sendWelcomeEmail(payload: SendWelcomeEmailJob) {
    await this.queue.add(MAIL_JOB_NAMES.SEND_WELCOME_EMAIL, payload);
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
