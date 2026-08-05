import { Worker, type ConnectionOptions, type Job, type Queue } from 'bullmq';
import { Prisma, type PrismaClient } from '@prisma/client';

import { logger } from '../logger/logger';
import { dedupKeyFor } from './dedup-key';
import { matchAndStartWorkflow, resumeWaitingWorkflow } from './workflow-engine';
import { matchesKeywords } from '../instagram/keyword-matcher';
import { upsertContact } from '../contacts/contact';
import {
  CAPTURE_STATUS,
  MAX_CAPTURE_ATTEMPTS,
  extractEmail,
  findActiveCapture,
  type PendingCapture,
} from './lead-capture';
import {
  AUTOMATION_JOB_NAMES,
  QUEUE_NAMES,
  WEBHOOK_JOB_NAMES,
  type ExecuteAutomationJob,
  type ProcessInstagramCommentJob,
  type ProcessInstagramMessageJob,
  type SendLeadReplyJob,
} from './queue-names.constant';

type RuleWithTriggers = Prisma.AutomationRuleGetPayload<{ include: { triggers: true } }>;

interface TriggerConfig {
  /** @deprecated Single-post filter from before multi-post rules. Still in live rows. */
  mediaId?: string;
  /** Posts the rule is limited to. Empty/absent = every post on the account. */
  mediaIds?: string[];
  maxDmsPerUserPer24h?: number;
}

/**
 * The rule's post filter as a list, accepting either shape. Rules created before
 * multi-post support store `mediaId` as a single string and are still live, so
 * both keys must be honoured — ignoring the old one would quietly widen those
 * rules to fire on every post.
 */
function mediaFilterOf(config: TriggerConfig | null | undefined): string[] {
  if (!config) return [];
  if (Array.isArray(config.mediaIds) && config.mediaIds.length > 0) return config.mediaIds;
  return config.mediaId ? [config.mediaId] : [];
}

/** SEND_DM action config — the lead-capture messages live here. */
interface DmActionConfig {
  text?: string;
  collectEmail?: boolean;
  emailSuccessMessage?: string;
  emailFailureMessage?: string;
}

export interface WebhookProcessingDeps {
  prisma: PrismaClient;
  automationQueue: Queue;
  workflowQueue: Queue;
}

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/** Words that mean "stop messaging me" — matched as a standalone reply. */
const OPT_OUT_WORDS = new Set([
  'stop',
  'stop all',
  'stopall',
  'unsubscribe',
  'cancel',
  'opt out',
  'optout',
  'remove me',
  'no more',
]);

/**
 * True when a DM is an opt-out request. Kept conservative — matches only when the
 * whole (short) message is an opt-out phrase, so "stop it's so good" doesn't
 * accidentally unsubscribe someone.
 */
export function isOptOut(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text
    .trim()
    .toLowerCase()
    .replace(/[!.।,]+$/g, '');
  return OPT_OUT_WORDS.has(t);
}

/**
 * Stage 1 of the comment → DM pipeline. Idempotent: every terminal outcome
 * records a `processed_comments` row keyed on the (unique) comment id, so a
 * duplicate delivery short-circuits at the dedup check. When a rule matches, the
 * heavy send work is handed to the `automation-execution` queue rather than done
 * inline — keeping this stage a fast DB-only pass.
 */
export async function processWebhookComment(
  job: ProcessInstagramCommentJob,
  deps: WebhookProcessingDeps,
): Promise<void> {
  const { prisma, automationQueue } = deps;
  const { commentId, commenterId, commentText, mediaId, instagramBusinessAccountId } = job;

  // 0. Defensive guard — a comment job with no commentId is malformed (e.g. a
  // misrouted message event). Bail before any query keyed on commentId.
  if (!commentId) {
    logger.warn({ commenterId, instagramBusinessAccountId }, 'comment job missing commentId — skipping');
    return;
  }

  // 1. Dedup — already seen this comment? Keyed on a 'cmt:'-namespaced hash so a
  // comment id can never collide with a message mid in the shared ledger.
  const dedupKey = dedupKeyFor('cmt', commentId);
  const seen = await prisma.processedComment.findUnique({ where: { dedupKey } });
  if (seen) {
    logOutcome({ commentId, commenterId, outcome: 'duplicate' });
    return;
  }

  // 2. Resolve the connected account that received the comment.
  const account = await prisma.instagramAccount.findFirst({
    where: { instagramBusinessId: instagramBusinessAccountId, deletedAt: null },
    select: {
      id: true,
      organizationId: true,
      instagramBusinessId: true,
      status: true,
      organization: { select: { isActive: true } },
    },
  });

  if (!account) {
    logOutcome({ commentId, commenterId, outcome: 'no_account', igId: instagramBusinessAccountId });
    await recordProcessed(prisma, dedupKey, { commentId, commenterId, mediaId, outcome: 'no_account' });
    return;
  }

  const logBase = {
    commentId,
    commenterId,
    accountId: account.id,
    organizationId: account.organizationId,
    mediaId,
  };

  // A super-admin can suspend an organization from the admin console; while
  // suspended it neither logs in nor runs automations.
  if (!account.organization.isActive) {
    logOutcome({ ...logBase, outcome: 'org_suspended' });
    await recordProcessed(prisma, dedupKey, {
      commentId,
      commenterId,
      mediaId,
      instagramAccountId: account.id,
      outcome: 'org_suspended',
    });
    return;
  }

  if (account.status !== 'CONNECTED') {
    logOutcome({ ...logBase, outcome: 'needs_reconnect', accountStatus: account.status });
    await recordProcessed(prisma, dedupKey, {
      commentId,
      commenterId,
      mediaId,
      instagramAccountId: account.id,
      outcome: 'needs_reconnect',
    });
    return;
  }

  // Never react to the account's own comments (its own automated replies would
  // otherwise loop back through the webhook).
  if (commenterId && commenterId === account.instagramBusinessId) {
    logOutcome({ ...logBase, outcome: 'self_comment' });
    await recordProcessed(prisma, dedupKey, {
      commentId,
      commenterId,
      mediaId,
      instagramAccountId: account.id,
      outcome: 'self_comment',
    });
    return;
  }

  // 3a. Visual workflows get first refusal. If one matches it CLAIMS the event
  // (keyword rules below are skipped) so a contact never gets a workflow DM AND a
  // keyword DM for the same comment.
  const workflowClaimed = await matchAndStartWorkflow(prisma, deps.workflowQueue, {
    accountId: account.id,
    organizationId: account.organizationId,
    source: 'comment',
    contactScopedId: commenterId,
    text: commentText,
    isStoryReply: false,
  });
  if (workflowClaimed) {
    logOutcome({ ...logBase, outcome: 'workflow_started' });
    await recordProcessed(prisma, dedupKey, {
      commentId,
      commenterId,
      mediaId,
      instagramAccountId: account.id,
      matched: true,
      outcome: 'workflow_started',
    });
    return;
  }

  // 3b. Otherwise, find the first active keyword rule that matches this comment.
  const rules = await prisma.automationRule.findMany({
    where: { instagramAccountId: account.id, status: 'ACTIVE', deletedAt: null },
    include: { triggers: true },
    orderBy: { priority: 'desc' },
  });

  const matchedRule = rules.find((rule) => ruleMatches(rule, commentText, mediaId));

  if (!matchedRule) {
    logOutcome({ ...logBase, outcome: 'no_match' });
    await recordProcessed(prisma, dedupKey, {
      commentId,
      commenterId,
      mediaId,
      instagramAccountId: account.id,
      matched: false,
      outcome: 'no_match',
    });
    return;
  }

  // 4. Record the match, then hand off to the execution queue.
  const created = await recordProcessed(prisma, dedupKey, {
    commentId,
    commenterId,
    mediaId,
    instagramAccountId: account.id,
    ruleId: matchedRule.id,
    matched: true,
    outcome: 'matched',
  });
  if (!created) {
    // A concurrent delivery already claimed this comment — don't double-enqueue.
    logOutcome({ ...logBase, ruleId: matchedRule.id, outcome: 'duplicate' });
    return;
  }

  // Capture the commenter as a CRM lead (idempotent) — a matched comment means
  // this person engaged with an automation.
  await upsertContact(prisma, {
    organizationId: account.organizationId,
    instagramAccountId: account.id,
    instagramScopedId: commenterId,
    username: job.commenterUsername,
  });

  const execJob: ExecuteAutomationJob = {
    ruleId: matchedRule.id,
    source: 'comment',
    eventId: commentId,
    commenterId,
    recipientId: commenterId, // comment DMs go via recipient.comment_id (eventId)
    mediaId,
    instagramAccountId: account.id,
  };
  await automationQueue.add(AUTOMATION_JOB_NAMES.EXECUTE_AUTOMATION, execJob, {
    jobId: `ax-${commentId}-${matchedRule.id}`,
  });

  logOutcome({ ...logBase, ruleId: matchedRule.id, outcome: 'matched' });
}

/**
 * Stage 1 for incoming DMs + story replies (Instagram `messages` field). Mirrors
 * the comment flow but matches DM_KEYWORD triggers and sends via the sender's id.
 * Reuses the `processed_comments` ledger (keyed on the message id) for dedup.
 */
export async function processWebhookMessage(
  job: ProcessInstagramMessageJob,
  deps: WebhookProcessingDeps,
): Promise<void> {
  const { prisma, automationQueue } = deps;
  const { messageId, text, senderId, isStoryReply, instagramBusinessAccountId } = job;

  // Dedup — keyed on a 'msg:'-namespaced hash (the mid is too long to uniquely
  // index raw, and namespacing keeps it from colliding with a comment id).
  const dedupKey = dedupKeyFor('msg', messageId);
  const seen = await prisma.processedComment.findUnique({ where: { dedupKey } });
  if (seen) {
    logOutcome({ messageId, senderId, outcome: 'duplicate' });
    return;
  }

  const account = await prisma.instagramAccount.findFirst({
    where: { instagramBusinessId: instagramBusinessAccountId, deletedAt: null },
    select: {
      id: true,
      organizationId: true,
      instagramBusinessId: true,
      status: true,
      organization: { select: { isActive: true } },
    },
  });
  if (!account) {
    logOutcome({ messageId, senderId, outcome: 'no_account', igId: instagramBusinessAccountId });
    await recordProcessed(prisma, dedupKey, {
      commentId: messageId,
      commenterId: senderId,
      mediaId: null,
      outcome: 'no_account',
    });
    return;
  }

  const logBase = {
    messageId,
    senderId,
    accountId: account.id,
    organizationId: account.organizationId,
    isStoryReply,
  };

  // Suspended organizations (via the admin console) run no automations.
  if (!account.organization.isActive) {
    logOutcome({ ...logBase, outcome: 'org_suspended' });
    await recordProcessed(prisma, dedupKey, {
      commentId: messageId,
      commenterId: senderId,
      mediaId: null,
      instagramAccountId: account.id,
      outcome: 'org_suspended',
    });
    return;
  }

  if (account.status !== 'CONNECTED') {
    logOutcome({ ...logBase, outcome: 'needs_reconnect', accountStatus: account.status });
    await recordProcessed(prisma, dedupKey, {
      commentId: messageId,
      commenterId: senderId,
      mediaId: null,
      instagramAccountId: account.id,
      outcome: 'needs_reconnect',
    });
    return;
  }

  // Ignore anything the business itself sent (echoes already filtered in the API).
  if (senderId && senderId === account.instagramBusinessId) {
    logOutcome({ ...logBase, outcome: 'self_comment' });
    await recordProcessed(prisma, dedupKey, {
      commentId: messageId,
      commenterId: senderId,
      mediaId: null,
      instagramAccountId: account.id,
      outcome: 'self_comment',
    });
    return;
  }

  // Opt-out: a "STOP"/"unsubscribe" DM unsubscribes the contact so no rule ever
  // DMs them again. Honored before anything else (even lead capture).
  if (!isStoryReply && isOptOut(text)) {
    const created = await recordProcessed(prisma, dedupKey, {
      commentId: messageId,
      commenterId: senderId,
      mediaId: null,
      instagramAccountId: account.id,
      outcome: 'opted_out',
    });
    if (created) {
      await prisma.contact.upsert({
        where: {
          instagramAccountId_instagramScopedId: {
            instagramAccountId: account.id,
            instagramScopedId: senderId,
          },
        },
        update: { isSubscribed: false },
        create: {
          organizationId: account.organizationId,
          instagramAccountId: account.id,
          instagramScopedId: senderId,
          isSubscribed: false,
        },
      });
    }
    logOutcome({ ...logBase, outcome: 'opted_out' });
    return;
  }

  // Workflow resume: if this contact has a workflow paused on a Wait/Collect step,
  // feed this reply into that run instead of starting anything new. Highest priority
  // after opt-out so an in-flight flow always consumes the reply it's waiting for.
  const resumed = await resumeWaitingWorkflow(prisma, deps.workflowQueue, {
    accountId: account.id,
    contactScopedId: senderId,
    text,
  });
  if (resumed) {
    logOutcome({ ...logBase, outcome: 'workflow_resumed' });
    await recordProcessed(prisma, dedupKey, {
      commentId: messageId,
      commenterId: senderId,
      mediaId: null,
      instagramAccountId: account.id,
      matched: true,
      outcome: 'workflow_resumed',
    });
    return;
  }

  // Lead-capture interception: if this contact is mid-email-capture, treat the
  // message as their email answer instead of matching keyword rules. Story
  // replies never carry an email, so they skip the intercept.
  if (!isStoryReply) {
    const capture = await findActiveCapture(prisma, account.id, senderId);
    if (capture) {
      const created = await recordProcessed(prisma, dedupKey, {
        commentId: messageId,
        commenterId: senderId,
        mediaId: null,
        instagramAccountId: account.id,
        ruleId: capture.ruleId,
        matched: true,
        outcome: 'lead_capture',
      });
      if (!created) {
        logOutcome({ ...logBase, outcome: 'duplicate' });
        return;
      }
      await handleLeadCaptureReply({ prisma, automationQueue }, { account, capture, senderId, text, messageId });
      return;
    }
  }

  // Visual workflows get first refusal on a fresh DM / story reply — a match claims
  // the event so keyword rules below don't also fire (no double DM).
  const workflowClaimed = await matchAndStartWorkflow(prisma, deps.workflowQueue, {
    accountId: account.id,
    organizationId: account.organizationId,
    source: 'message',
    contactScopedId: senderId,
    text,
    isStoryReply,
  });
  if (workflowClaimed) {
    logOutcome({ ...logBase, outcome: 'workflow_started' });
    await recordProcessed(prisma, dedupKey, {
      commentId: messageId,
      commenterId: senderId,
      mediaId: null,
      instagramAccountId: account.id,
      matched: true,
      outcome: 'workflow_started',
    });
    return;
  }

  const rules = await prisma.automationRule.findMany({
    where: { instagramAccountId: account.id, status: 'ACTIVE', deletedAt: null },
    include: { triggers: true },
    orderBy: { priority: 'desc' },
  });
  const matchedRule = rules.find((rule) => messageRuleMatches(rule, text, isStoryReply));

  if (!matchedRule) {
    logOutcome({ ...logBase, outcome: 'no_match' });
    await recordProcessed(prisma, dedupKey, {
      commentId: messageId,
      commenterId: senderId,
      mediaId: null,
      instagramAccountId: account.id,
      matched: false,
      outcome: 'no_match',
    });
    return;
  }

  const created = await recordProcessed(prisma, dedupKey, {
    commentId: messageId,
    commenterId: senderId,
    mediaId: null,
    instagramAccountId: account.id,
    ruleId: matchedRule.id,
    matched: true,
    outcome: 'matched',
  });
  if (!created) {
    logOutcome({ ...logBase, ruleId: matchedRule.id, outcome: 'duplicate' });
    return;
  }

  await upsertContact(prisma, {
    organizationId: account.organizationId,
    instagramAccountId: account.id,
    instagramScopedId: senderId,
    username: null,
  });

  const execJob: ExecuteAutomationJob = {
    ruleId: matchedRule.id,
    source: 'message',
    eventId: messageId,
    commenterId: senderId,
    recipientId: senderId, // reply goes directly to the sender's IGSID
    mediaId: null,
    instagramAccountId: account.id,
  };
  await automationQueue.add(AUTOMATION_JOB_NAMES.EXECUTE_AUTOMATION, execJob, {
    jobId: `ax-${messageId}-${matchedRule.id}`,
  });

  logOutcome({ ...logBase, ruleId: matchedRule.id, outcome: 'matched' });
}

/**
 * Handles an intercepted lead-capture reply: extracts an email, and either saves
 * it to the contact + sends the success DM, or (on a non-email reply) bumps the
 * attempt count and sends the retry DM until attempts are exhausted. The dedup
 * row was already claimed by the caller, so this only mutates state + enqueues.
 */
async function handleLeadCaptureReply(
  deps: Pick<WebhookProcessingDeps, 'prisma' | 'automationQueue'>,
  ctx: {
    account: { id: string; organizationId: string };
    capture: PendingCapture;
    senderId: string;
    text: string;
    messageId: string;
  },
): Promise<void> {
  const { prisma, automationQueue } = deps;
  const { account, capture, senderId, text, messageId } = ctx;
  const logBase = { messageId, senderId, accountId: account.id, ruleId: capture.ruleId };

  // Pull the success/failure copy off the rule's SEND_DM action.
  const rule = await prisma.automationRule.findFirst({
    where: { id: capture.ruleId, deletedAt: null },
    include: { actions: true },
  });
  const dmConfig = parseJson<DmActionConfig>(
    rule?.actions.find((a) => a.type === 'SEND_DM')?.config ?? null,
  );

  const enqueueReply = async (replyText: string | undefined | null): Promise<void> => {
    const trimmed = replyText?.trim();
    if (!trimmed) return;
    const replyJob: SendLeadReplyJob = {
      instagramAccountId: account.id,
      organizationId: account.organizationId,
      recipientId: senderId,
      text: trimmed,
    };
    await automationQueue.add(AUTOMATION_JOB_NAMES.SEND_LEAD_REPLY, replyJob, {
      jobId: `lead-reply-${messageId}`,
    });
  };

  const email = extractEmail(text);
  if (email) {
    // Save the captured email to the contact and confirm the subscription.
    await prisma.contact.updateMany({
      where: { instagramAccountId: account.id, instagramScopedId: senderId },
      data: { email, isSubscribed: true, lastInteractionAt: new Date() },
    });
    await prisma.pendingLeadCapture.update({
      where: { id: capture.id },
      data: { status: CAPTURE_STATUS.COMPLETED, capturedEmail: email },
    });
    await enqueueReply(dmConfig?.emailSuccessMessage);
    logOutcome({ ...logBase, outcome: 'lead_captured' }); // email itself is PII — not logged
    return;
  }

  // Not an email — count the attempt, give up after the cap.
  const attempts = capture.attempts + 1;
  const exhausted = attempts >= MAX_CAPTURE_ATTEMPTS;
  await prisma.pendingLeadCapture.update({
    where: { id: capture.id },
    data: { attempts, status: exhausted ? CAPTURE_STATUS.EXPIRED : CAPTURE_STATUS.AWAITING },
  });
  if (!exhausted) {
    await enqueueReply(dmConfig?.emailFailureMessage);
  }
  logOutcome({
    ...logBase,
    outcome: exhausted ? 'lead_capture_expired' : 'lead_capture_retry',
    attempts,
  });
}

function ruleMatches(rule: RuleWithTriggers, commentText: string, mediaId: string | null): boolean {
  return rule.triggers.some((trigger) => {
    if (trigger.type !== 'COMMENT_KEYWORD') return false;
    const config = parseJson<TriggerConfig>(trigger.config);
    // Optional per-media filter: only fire on comments on the selected posts.
    // An empty list means "every post". A rule that names specific posts must
    // not fire when the webhook carries no media id at all.
    const allowedMedia = mediaFilterOf(config);
    if (allowedMedia.length > 0 && (!mediaId || !allowedMedia.includes(mediaId))) return false;
    const keywords = parseJson<string[]>(trigger.keywords) ?? [];
    return matchesKeywords(commentText, trigger.matchType, keywords);
  });
}

function messageRuleMatches(
  rule: RuleWithTriggers,
  text: string,
  isStoryReply: boolean,
): boolean {
  return rule.triggers.some((trigger) => {
    // DM_KEYWORD fires on direct DMs only; STORY_REPLY on story replies only.
    const applies =
      (trigger.type === 'DM_KEYWORD' && !isStoryReply) ||
      (trigger.type === 'STORY_REPLY' && isStoryReply);
    if (!applies) return false;
    const keywords = parseJson<string[]>(trigger.keywords) ?? [];
    return matchesKeywords(text, trigger.matchType, keywords);
  });
}

/**
 * Inserts the ledger row for a comment. Returns false when the unique commentId
 * already exists (a concurrent delivery won the race) so the caller can avoid
 * enqueuing a duplicate execution job.
 */
async function recordProcessed(
  prisma: PrismaClient,
  dedupKey: string,
  data: {
    commentId: string;
    commenterId: string;
    mediaId: string | null;
    instagramAccountId?: string;
    ruleId?: string;
    matched?: boolean;
    outcome: string;
  },
): Promise<boolean> {
  try {
    await prisma.processedComment.create({
      data: {
        commentId: data.commentId,
        dedupKey,
        commenterId: data.commenterId,
        mediaId: data.mediaId,
        instagramAccountId: data.instagramAccountId ?? null,
        ruleId: data.ruleId ?? null,
        matched: data.matched ?? false,
        dmSent: false,
        outcome: data.outcome,
      },
    });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return false;
    }
    throw error;
  }
}

function logOutcome(fields: Record<string, unknown>): void {
  logger.info({ ...fields, stage: 'webhook-processing', timestamp: new Date().toISOString() });
}

/**
 * Creates the BullMQ Worker for the `webhook-processing` queue. Retry/backoff is
 * set by the producer (growasy-api) as default job options; on failure we simply
 * rethrow so BullMQ's own retry logic runs.
 */
export function createWebhookProcessingWorker(options: {
  connection: ConnectionOptions;
  deps: WebhookProcessingDeps;
  concurrency?: number;
}): Worker {
  const { connection, deps, concurrency = 10 } = options;

  const worker = new Worker(
    QUEUE_NAMES.WEBHOOK_PROCESSING,
    async (job: Job) => {
      if (job.name === WEBHOOK_JOB_NAMES.PROCESS_INSTAGRAM_MESSAGE) {
        await processWebhookMessage(job.data as ProcessInstagramMessageJob, deps);
      } else if (job.name === WEBHOOK_JOB_NAMES.PROCESS_INSTAGRAM_COMMENT) {
        await processWebhookComment(job.data as ProcessInstagramCommentJob, deps);
      } else {
        // Never route an unknown/stale job into the comment processor — that path
        // reads job.commentId and would blow up on `where: { commentId: undefined }`.
        logger.warn({ jobId: job.id, name: job.name }, 'unknown webhook job — skipping');
      }
    },
    { connection, concurrency },
  );

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, attemptsMade: job?.attemptsMade, err },
      'webhook-processing job failed',
    );
  });
  worker.on('error', (err) => {
    logger.error({ err }, 'webhook-processing worker error');
  });

  return worker;
}
