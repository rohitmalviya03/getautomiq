import { Worker, type ConnectionOptions, type Job } from 'bullmq';

import { logger } from '../logger/logger';
import type { MailService } from '../mail/mail.service';
import {
  MAIL_JOB_NAMES,
  QUEUE_NAMES,
  type SendAdminMessageEmailJob,
  type SendPasswordResetEmailJob,
  type SendPlanExpiredEmailJob,
  type SendPlanExpiringEmailJob,
  type SendVerificationEmailJob,
  type SendWelcomeEmailJob,
} from './queue-names.constant';

/**
 * Dispatches a single job from the `mail` queue to the right MailService
 * method based on job.name. Exported separately from the Worker so it can be
 * unit tested with a fake Job/MailService, without needing a live Redis
 * connection.
 */
export async function dispatchMailJob(job: Job, mailService: MailService): Promise<void> {
  switch (job.name) {
    case MAIL_JOB_NAMES.SEND_VERIFICATION_EMAIL: {
      const data = job.data as SendVerificationEmailJob;
      await mailService.sendVerificationEmail(data);
      return;
    }
    case MAIL_JOB_NAMES.SEND_PASSWORD_RESET_EMAIL: {
      const data = job.data as SendPasswordResetEmailJob;
      await mailService.sendPasswordResetEmail(data);
      return;
    }
    case MAIL_JOB_NAMES.SEND_WELCOME_EMAIL: {
      const data = job.data as SendWelcomeEmailJob;
      await mailService.sendWelcomeEmail(data);
      return;
    }
    case MAIL_JOB_NAMES.SEND_PLAN_EXPIRING_EMAIL: {
      const data = job.data as SendPlanExpiringEmailJob;
      await mailService.sendPlanExpiringEmail(data);
      return;
    }
    case MAIL_JOB_NAMES.SEND_PLAN_EXPIRED_EMAIL: {
      const data = job.data as SendPlanExpiredEmailJob;
      await mailService.sendPlanExpiredEmail(data);
      return;
    }
    case MAIL_JOB_NAMES.SEND_ADMIN_MESSAGE_EMAIL: {
      const data = job.data as SendAdminMessageEmailJob;
      await mailService.sendAdminMessageEmail(data);
      return;
    }
    default: {
      // Unknown job name on the mail queue: fail loudly instead of silently
      // dropping it, so BullMQ marks it failed and it surfaces in monitoring.
      throw new Error(`Unrecognized job name on "${QUEUE_NAMES.MAIL}" queue: ${job.name}`);
    }
  }
}

/**
 * Creates (but does not start beyond BullMQ's own auto-start) the BullMQ
 * Worker consuming the `mail` queue. Retry/backoff is intentionally not
 * configured here — the producer (growasy-api) already sets `attempts: 5`
 * with exponential backoff as default job options, and overriding worker-side
 * would fight that. On failure we simply rethrow so BullMQ's own retry logic
 * takes over.
 */
export function createMailWorker(options: {
  connection: ConnectionOptions;
  mailService: MailService;
  concurrency?: number;
}): Worker {
  const { connection, mailService, concurrency = 5 } = options;

  const worker = new Worker(
    QUEUE_NAMES.MAIL,
    async (job) => {
      logger.info({ jobId: job.id, jobName: job.name }, 'processing mail job');
      await dispatchMailJob(job, mailService);
    },
    {
      connection,
      concurrency,
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, jobName: job.name }, 'mail job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, jobName: job?.name, attemptsMade: job?.attemptsMade, err },
      'mail job failed',
    );
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'mail worker error');
  });

  return worker;
}
