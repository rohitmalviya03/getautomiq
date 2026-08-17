import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { AppConfigService } from '../config/app-config.service';
import {
  MAIL_JOB_NAMES,
  QUEUE_NAMES,
  SendPasswordResetEmailJob,
  SendPlanExpiredEmailJob,
  SendAdminMessageEmailJob,
  SendPlanExpiringEmailJob,
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

  /**
   * Plan-lifecycle mail. The `jobId` is deliberately deterministic — it includes
   * the subscription and the period it refers to, so the daily cron re-enqueuing
   * the same reminder is a no-op in BullMQ rather than a duplicate email.
   */
  async sendPlanExpiringEmail(payload: SendPlanExpiringEmailJob, dedupeKey: string) {
    await this.queue.add(MAIL_JOB_NAMES.SEND_PLAN_EXPIRING_EMAIL, payload, {
      jobId: `plan-expiring-${dedupeKey}`,
    });
  }

  async sendPlanExpiredEmail(payload: SendPlanExpiredEmailJob, dedupeKey: string) {
    await this.queue.add(MAIL_JOB_NAMES.SEND_PLAN_EXPIRED_EMAIL, payload, {
      jobId: `plan-expired-${dedupeKey}`,
    });
  }

  /**
   * A one-off message an admin wrote to a customer. No dedupe key: unlike the
   * lifecycle mails above, sending the same subject twice is a deliberate act
   * (a follow-up), not a duplicate to be swallowed.
   */
  async sendAdminMessageEmail(payload: SendAdminMessageEmailJob) {
    await this.queue.add(MAIL_JOB_NAMES.SEND_ADMIN_MESSAGE_EMAIL, payload, {
      jobId: `admin-msg-${payload.toEmail}-${Date.now()}`,
    });
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
