import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import { Prisma, type PrismaClient } from '@prisma/client';

import { logger } from '../logger/logger';
import type { TokenDecryptor } from '../crypto/token-encryption';
import { InstagramApiError, type MetaGraphClient } from '../instagram/meta-graph.client';
import {
  decrementDmUsage,
  getDmQuota,
  incrementDmUsage,
  notifyMonthlyDmLimit,
} from '../billing/usage';
import { dedupKeyFor } from './dedup-key';
import { openLeadCapture } from './lead-capture';
import {
  AUTOMATION_JOB_NAMES,
  QUEUE_NAMES,
  type ExecuteAutomationJob,
  type SendLeadReplyJob,
} from './queue-names.constant';

const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_DMS_PER_USER_PER_24H = 1;

type RuleWithGraph = Prisma.AutomationRuleGetPayload<{
  include: { triggers: true; actions: true; instagramAccount: true };
}>;

interface TriggerConfig {
  maxDmsPerUserPer24h?: number;
}

interface ActionConfig {
  text?: string;
  collectEmail?: boolean;
  emailSuccessMessage?: string;
  emailFailureMessage?: string;
}

export interface AutomationExecutionDeps {
  prisma: PrismaClient;
  decryptor: TokenDecryptor;
  metaClient: MetaGraphClient;
}

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/** Minimal `{{username}}` interpolation — the worker has no username, so → "there". */
function renderTemplate(template: string): string {
  return template.replace(/\{\{\s*username\s*\}\}/gi, 'there');
}

function resolveRateLimit(rule: RuleWithGraph): number {
  for (const trigger of rule.triggers) {
    const config = parseJson<TriggerConfig>(trigger.config);
    if (typeof config?.maxDmsPerUserPer24h === 'number' && config.maxDmsPerUserPer24h > 0) {
      return config.maxDmsPerUserPer24h;
    }
  }
  return DEFAULT_MAX_DMS_PER_USER_PER_24H;
}

async function markProcessed(
  prisma: PrismaClient,
  commentId: string,
  dedupKey: string,
  data: { matched?: boolean; dmSent?: boolean; outcome: string; errorMessage?: string | null },
): Promise<void> {
  // The stage-1 row usually exists already; upsert keeps this safe even if it
  // somehow doesn't (e.g. a job replayed out of order). `dedupKey` must be the
  // SAME namespaced hash stage 1 wrote for this event, so the update lands.
  await prisma.processedComment.upsert({
    where: { dedupKey },
    update: {
      matched: data.matched ?? undefined,
      dmSent: data.dmSent ?? undefined,
      outcome: data.outcome,
      errorMessage: data.errorMessage ?? null,
    },
    create: {
      commentId,
      dedupKey,
      commenterId: 'unknown',
      matched: data.matched ?? true,
      dmSent: data.dmSent ?? false,
      outcome: data.outcome,
      errorMessage: data.errorMessage ?? null,
    },
  });
}

/**
 * Stage 2 of the comment → DM pipeline. Enforces the per-user 24h DM rate limit,
 * decrypts the account token, and runs the rule's actions (SEND_DM, optional
 * REPLY_COMMENT). A dead token flips the account to NEEDS_RECONNECT and is NOT
 * retried; any other API error is rethrown so BullMQ's exponential backoff runs.
 */
export async function processAutomationExecution(
  job: ExecuteAutomationJob,
  deps: AutomationExecutionDeps,
): Promise<void> {
  const { prisma, decryptor, metaClient } = deps;
  const { ruleId, eventId, commenterId, source, recipientId } = job;
  // Same namespaced key stage 1 (webhook-processing) wrote for this event, so the
  // ledger row is updated in place rather than duplicated.
  const dedupKey = dedupKeyFor(source === 'message' ? 'msg' : 'cmt', eventId);

  const rule = await prisma.automationRule.findFirst({
    where: { id: ruleId, deletedAt: null },
    include: { triggers: true, actions: { orderBy: { order: 'asc' } }, instagramAccount: true },
  });

  const logBase = {
    stage: 'automation-execution',
    source,
    eventId,
    commenterId,
    ruleId,
    accountId: job.instagramAccountId,
  };

  if (!rule) {
    logger.warn({ ...logBase, outcome: 'rule_gone' }, 'automation rule no longer exists');
    return;
  }

  const account = rule.instagramAccount;
  const org = rule.organizationId;

  if (account.status !== 'CONNECTED') {
    logOutcome({ ...logBase, organizationId: org, outcome: 'needs_reconnect' });
    await markProcessed(prisma, eventId, dedupKey, { outcome: 'needs_reconnect' });
    return;
  }

  // Respect opt-outs: never message a contact who unsubscribed (replied STOP).
  const contact = await prisma.contact.findUnique({
    where: {
      instagramAccountId_instagramScopedId: {
        instagramAccountId: account.id,
        instagramScopedId: commenterId,
      },
    },
    select: { isSubscribed: true },
  });
  if (contact && !contact.isSubscribed) {
    logOutcome({ ...logBase, organizationId: org, outcome: 'unsubscribed' });
    await markProcessed(prisma, eventId, dedupKey, { outcome: 'unsubscribed' });
    return;
  }

  // Layer B — per-contact rate limit: cap automated DMs to this Instagram user
  // across ALL rules on this account per 24h. Keeps us from spamming one person
  // (and getting the account flagged by Meta), independent of the monthly quota.
  const maxDms = resolveRateLimit(rule);
  const recentDms = await prisma.processedComment.count({
    where: {
      commenterId,
      instagramAccountId: account.id,
      dmSent: true,
      createdAt: { gte: new Date(Date.now() - RATE_WINDOW_MS) },
    },
  });
  if (recentDms >= maxDms) {
    logOutcome({ ...logBase, organizationId: org, outcome: 'rate_limited', recentDms, maxDms });
    await markProcessed(prisma, eventId, dedupKey, { outcome: 'rate_limited' });
    return;
  }

  // Plan enforcement: monthly DM quota, reset per the org's BILLING period.
  // `getDmQuota` returns the limit + the billing-anchored period key in one query.
  const { limit: dmLimit, period } = await getDmQuota(prisma, org);

  const dmAction = rule.actions.find((a) => a.type === 'SEND_DM');
  const dmConfig = parseJson<ActionConfig>(dmAction?.config ?? null);
  const dmText = renderTemplate(dmConfig?.text ?? '');
  const willSendDm = Boolean(dmAction && dmText);

  const token = decryptor.decrypt(account.accessTokenEncrypted);

  // Reserve a DM slot up-front with an ATOMIC increment, then check the returned
  // count. This closes the check-then-increment race: concurrent workers can't
  // both slip past the cap. Over the cap → release the slot and stop.
  if (willSendDm) {
    const reservedCount = await incrementDmUsage(prisma, org, period);
    if (dmLimit !== null && reservedCount > dmLimit) {
      await decrementDmUsage(prisma, org, period);
      logOutcome({
        ...logBase,
        organizationId: org,
        outcome: 'plan_limit_reached',
        usedThisMonth: reservedCount - 1,
        dmLimit,
      });
      await markProcessed(prisma, eventId, dedupKey, { outcome: 'plan_limit_reached' });
      await notifyMonthlyDmLimit(prisma, org, account.connectedByUserId, period);
      return;
    }
  }

  // Public comment reply FIRST (comment trigger only). It uses the comments
  // permission — independent of messaging — so it still posts even when DM
  // sending is unavailable. A failure here must not abort the DM.
  if (source === 'comment') {
    const replyAction = rule.actions.find((a) => a.type === 'REPLY_COMMENT');
    const replyText = renderTemplate(
      parseJson<ActionConfig>(replyAction?.config ?? null)?.text ?? '',
    );
    if (replyAction && replyText) {
      try {
        await metaClient.replyToComment(eventId, replyText, token);
        logOutcome({ ...logBase, organizationId: org, outcome: 'reply_sent' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        logOutcome({ ...logBase, organizationId: org, outcome: 'reply_failed', error: message });
      }
    }
  }

  // Send the DM (the primary action) — its result drives the job outcome.
  try {
    if (willSendDm) {
      if (source === 'message') {
        await metaClient.sendDm(recipientId, dmText, token);
      } else {
        await metaClient.sendDmToComment(eventId, dmText, token);
      }

      // Lead capture: now that the ask-for-email DM is out, start listening for
      // this contact's next reply. Keyed on the commenter/sender IGSID, which is
      // the sender id their reply will arrive under.
      if (dmConfig?.collectEmail) {
        await openLeadCapture(prisma, {
          instagramAccountId: account.id,
          organizationId: org,
          contactScopedId: commenterId,
          ruleId,
        });
      }
    }

    await markProcessed(prisma, eventId, dedupKey, { matched: true, dmSent: true, outcome: 'dm_sent' });
    logOutcome({ ...logBase, organizationId: org, outcome: 'dm_sent' });
  } catch (error) {
    // The send failed — release the reserved DM slot so the counter only ever
    // reflects successful sends.
    if (willSendDm) {
      await decrementDmUsage(prisma, org, period);
    }
    const message = error instanceof Error ? error.message : 'unknown error';

    if (error instanceof InstagramApiError && error.isAuthError) {
      // Terminal: the token is dead. Flag the account and stop — retrying won't help.
      await prisma.instagramAccount.update({
        where: { id: account.id },
        data: { status: 'NEEDS_RECONNECT' },
      });
      await markProcessed(prisma, eventId, dedupKey, {
        outcome: 'needs_reconnect',
        errorMessage: message,
      });
      logOutcome({ ...logBase, organizationId: org, outcome: 'needs_reconnect', error: message });
      return;
    }

    await markProcessed(prisma, eventId, dedupKey, { outcome: 'failed', errorMessage: message });
    logOutcome({ ...logBase, organizationId: org, outcome: 'failed', error: message });
    throw error; // let BullMQ retry (attempts: 3, exponential backoff)
  }
}

/**
 * Sends a single lead-capture confirmation/retry DM. Enqueued by the webhook
 * stage after it intercepts an email reply — no rule, no dedup ledger, just a
 * direct DM to the contact. A dead token flips the account to NEEDS_RECONNECT;
 * other errors rethrow for BullMQ retry.
 */
export async function processSendLeadReply(
  job: SendLeadReplyJob,
  deps: AutomationExecutionDeps,
): Promise<void> {
  const { prisma, decryptor, metaClient } = deps;
  const { instagramAccountId, organizationId, recipientId, text } = job;
  const logBase = { stage: 'lead-reply', instagramAccountId, recipientId };

  const account = await prisma.instagramAccount.findFirst({
    where: { id: instagramAccountId, deletedAt: null },
    select: { id: true, status: true, accessTokenEncrypted: true },
  });
  if (!account || account.status !== 'CONNECTED') {
    logOutcome({ ...logBase, outcome: 'skipped_account' });
    return;
  }

  const token = decryptor.decrypt(account.accessTokenEncrypted);
  const { period } = await getDmQuota(prisma, organizationId);
  try {
    await metaClient.sendDm(recipientId, text, token);
    await incrementDmUsage(prisma, organizationId, period);
    logOutcome({ ...logBase, outcome: 'sent' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    if (error instanceof InstagramApiError && error.isAuthError) {
      await prisma.instagramAccount.update({
        where: { id: account.id },
        data: { status: 'NEEDS_RECONNECT' },
      });
      logOutcome({ ...logBase, outcome: 'needs_reconnect', error: message });
      return;
    }
    logOutcome({ ...logBase, outcome: 'failed', error: message });
    throw error; // let BullMQ retry
  }
}

function logOutcome(fields: Record<string, unknown>): void {
  logger.info({ ...fields, timestamp: new Date().toISOString() });
}

/**
 * Producer for the `automation-execution` queue. Retry policy lives here (the
 * webhook-processing consumer that enqueues these jobs is the "producer" for
 * this queue), per the spec: attempts 3, exponential backoff — no hand-rolled
 * retry loops in the processor.
 */
export function createAutomationExecutionQueue(connection: ConnectionOptions): Queue {
  return new Queue(QUEUE_NAMES.AUTOMATION_EXECUTION, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });
}

/** Creates the BullMQ Worker for the `automation-execution` queue. */
export function createAutomationExecutionWorker(options: {
  connection: ConnectionOptions;
  deps: AutomationExecutionDeps;
  concurrency?: number;
}): Worker {
  const { connection, deps, concurrency = 5 } = options;

  const worker = new Worker(
    QUEUE_NAMES.AUTOMATION_EXECUTION,
    async (job: Job) => {
      if (job.name === AUTOMATION_JOB_NAMES.SEND_LEAD_REPLY) {
        await processSendLeadReply(job.data as SendLeadReplyJob, deps);
      } else {
        await processAutomationExecution(job.data as ExecuteAutomationJob, deps);
      }
    },
    { connection, concurrency },
  );

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, attemptsMade: job?.attemptsMade, err },
      'automation-execution job failed',
    );
  });
  worker.on('error', (err) => {
    logger.error({ err }, 'automation-execution worker error');
  });

  return worker;
}
