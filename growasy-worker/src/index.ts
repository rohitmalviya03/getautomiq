import 'dotenv/config'; // load .env into process.env BEFORE anything reads it
import IORedis from 'ioredis';
import { Queue } from 'bullmq';

import { validateEnv } from './config/env';
import { QUEUE_NAMES } from './queues/queue-names.constant';
import { createHealthServer, startHealthServer, stopHealthServer } from './health/health-server';
import { logger } from './logger/logger';
import { MailService } from './mail/mail.service';
import { createMailWorker } from './queues/mail.processor';
import { prisma } from './prisma/prisma';
import { TokenDecryptor } from './crypto/token-encryption';
import { MetaGraphClient } from './instagram/meta-graph.client';
import { createWebhookProcessingWorker } from './queues/webhook-processing.processor';
import {
  createAutomationExecutionQueue,
  createAutomationExecutionWorker,
} from './queues/automation-execution.processor';
import {
  createWorkflowExecutionQueue,
  createWorkflowExecutionWorker,
} from './queues/workflow-engine';

async function bootstrap(): Promise<void> {
  const env = validateEnv(process.env);

  // BullMQ requires maxRetriesPerRequest: null on the connection it manages,
  // and enableReadyCheck: false is the recommended pairing for long-lived
  // worker connections. The same connection is reused for the /health probe.
  const connection = new IORedis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  connection.on('error', (err) => {
    logger.error({ err }, 'redis connection error');
  });

  // ---- mail queue (existing) -------------------------------------------
  const mailService = new MailService(env);
  const mailWorker = createMailWorker({ connection, mailService, concurrency: 5 });
  mailWorker.on('ready', () => logger.info({ queue: 'mail' }, 'mail worker ready'));

  // ---- Instagram comment → DM pipeline ---------------------------------
  const decryptor = new TokenDecryptor(env.ENCRYPTION_KEY);
  const metaClient = new MetaGraphClient({
    graphBase: env.INSTAGRAM_GRAPH_BASE,
    apiVersion: env.META_GRAPH_API_VERSION,
  });

  // Stage-1 consumer enqueues onto this queue; stage-2 consumer drains it.
  const automationQueue = createAutomationExecutionQueue(connection);
  // Visual workflow engine: stage-1 also starts runs onto this queue.
  const workflowQueue = createWorkflowExecutionQueue(connection);

  const webhookWorker = createWebhookProcessingWorker({
    connection,
    deps: { prisma, automationQueue, workflowQueue },
    concurrency: env.WEBHOOK_PROCESSING_CONCURRENCY,
  });
  webhookWorker.on('ready', () =>
    logger.info({ queue: 'webhook-processing' }, 'webhook-processing worker ready'),
  );

  const workflowWorker = createWorkflowExecutionWorker({
    connection,
    deps: { prisma, decryptor, metaClient },
    queue: workflowQueue,
    concurrency: env.AUTOMATION_EXECUTION_CONCURRENCY,
  });
  workflowWorker.on('ready', () =>
    logger.info({ queue: 'workflow-execution' }, 'workflow-execution worker ready'),
  );

  const automationWorker = createAutomationExecutionWorker({
    connection,
    deps: { prisma, decryptor, metaClient },
    concurrency: env.AUTOMATION_EXECUTION_CONCURRENCY,
  });
  automationWorker.on('ready', () =>
    logger.info({ queue: 'automation-execution' }, 'automation-execution worker ready'),
  );

  const healthServer = createHealthServer(connection);
  await startHealthServer(healthServer, env.HEALTH_PORT);

  // DIAGNOSTIC: log which Redis we're on + how many jobs are waiting in the
  // webhook-processing queue. If the API enqueued a comment but this shows
  // waiting: 0, the API and worker are on DIFFERENT Redis instances.
  try {
    const diagQueue = new Queue(QUEUE_NAMES.WEBHOOK_PROCESSING, { connection });
    const counts = await diagQueue.getJobCounts();
    logger.info(
      {
        redis: `${env.REDIS_HOST}:${env.REDIS_PORT}`,
        queue: QUEUE_NAMES.WEBHOOK_PROCESSING,
        counts,
      },
      'webhook-processing queue state at startup',
    );
  } catch (err) {
    logger.error({ err }, 'failed to read webhook-processing queue counts');
  }

  logger.info({ nodeEnv: env.NODE_ENV }, 'growasy-worker started');

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');

    try {
      await Promise.all([
        mailWorker.close(),
        webhookWorker.close(),
        automationWorker.close(),
        workflowWorker.close(),
      ]);
      await automationQueue.close();
      await workflowQueue.close();
      await stopHealthServer(healthServer);
      await prisma.$disconnect();
      connection.disconnect();
      logger.info('shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error({ err }, 'fatal error during bootstrap');
  process.exit(1);
});
