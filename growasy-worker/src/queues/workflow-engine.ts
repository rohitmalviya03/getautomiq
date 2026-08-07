import { createHash } from 'node:crypto';
import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import { Prisma, type PrismaClient, type TriggerMatchType } from '@prisma/client';

import { logger } from '../logger/logger';
import { matchesKeywords } from '../instagram/keyword-matcher';
import { InstagramApiError, type MetaGraphClient } from '../instagram/meta-graph.client';
import type { TokenDecryptor } from '../crypto/token-encryption';
import {
  decrementDmUsage,
  getDmQuota,
  incrementDmUsage,
  notifyMonthlyDmLimit,
} from '../billing/usage';
import { QUEUE_NAMES, WORKFLOW_JOB_NAMES, type RunWorkflowJob } from './queue-names.constant';

export interface WorkflowEngineDeps {
  prisma: PrismaClient;
  decryptor: TokenDecryptor;
  metaClient: MetaGraphClient;
}

/** Safety valve so a mis-wired graph (a cycle) can't spin a job forever. */
const MAX_STEPS_PER_JOB = 50;
/** Per-contact 24h DM cap for workflow sends — shared with keyword automation via the ProcessedComment ledger. */
const DEFAULT_MAX_DMS_PER_USER_PER_24H = 5;
const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WAIT_HOURS = 24;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/;

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

type WorkflowWithGraph = Prisma.WorkflowGetPayload<{ include: { nodes: true; edges: true } }>;
type NodeRow = WorkflowWithGraph['nodes'][number];
type EdgeRow = WorkflowWithGraph['edges'][number];

interface TriggerConfig {
  triggerType?: 'DM_KEYWORD' | 'COMMENT_KEYWORD' | 'STORY_REPLY';
  matchType?: TriggerMatchType;
  keywords?: string[];
}

interface RunAccount {
  id: string;
  organizationId: string;
  accessTokenEncrypted: string;
  connectedByUserId: string | null;
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

export function createWorkflowExecutionQueue(connection: ConnectionOptions): Queue {
  return new Queue(QUEUE_NAMES.WORKFLOW_EXECUTION, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });
}

// ---------------------------------------------------------------------------
// Stage-1: trigger matching (called from webhook-processing)
// ---------------------------------------------------------------------------

/**
 * If an ACTIVE workflow's Trigger matches this event, start a run and enqueue it,
 * returning true so the caller CLAIMS the event (keyword rules are then skipped for
 * it — no double DM). Highest `priority` wins; first match claims.
 */
export async function matchAndStartWorkflow(
  prisma: PrismaClient,
  queue: Queue,
  ctx: {
    accountId: string;
    organizationId: string;
    source: 'comment' | 'message';
    contactScopedId: string;
    text: string;
    isStoryReply: boolean;
  },
): Promise<boolean> {
  const workflows = await prisma.workflow.findMany({
    where: { instagramAccountId: ctx.accountId, status: 'ACTIVE', deletedAt: null },
    orderBy: { priority: 'desc' },
    include: { nodes: true, edges: true },
  });
  if (workflows.length === 0) return false;

  const eventType =
    ctx.source === 'comment' ? 'COMMENT_KEYWORD' : ctx.isStoryReply ? 'STORY_REPLY' : 'DM_KEYWORD';

  for (const wf of workflows) {
    const trigger = wf.nodes.find((n) => n.type === 'TRIGGER');
    if (!trigger) continue;
    const cfg = parseJson<TriggerConfig>(trigger.config) ?? {};
    if ((cfg.triggerType ?? 'DM_KEYWORD') !== eventType) continue;

    const matchType = (cfg.matchType ?? 'CONTAINS') as TriggerMatchType;
    if (!matchesKeywords(ctx.text ?? '', matchType, cfg.keywords ?? [])) continue;

    const startNodeId = firstEdgeTarget(wf.edges, trigger.id);
    const run = await prisma.workflowRun.create({
      data: {
        workflowId: wf.id,
        organizationId: ctx.organizationId,
        instagramAccountId: ctx.accountId,
        contactScopedId: ctx.contactScopedId,
        status: 'RUNNING',
        currentNodeId: startNodeId,
        variables: JSON.stringify({ triggerText: ctx.text ?? '' }),
      },
    });
    await queue.add(
      WORKFLOW_JOB_NAMES.RUN_WORKFLOW,
      { runId: run.id } satisfies RunWorkflowJob,
      { jobId: `wfr-${run.id}` },
    );
    logger.info(
      { stage: 'workflow', workflowId: wf.id, runId: run.id, contact: ctx.contactScopedId },
      'workflow run started',
    );
    return true;
  }
  return false;
}

/**
 * Resume a WAITING (wait-for-reply / collect-input) run with the contact's reply.
 * Called by the message processor BEFORE keyword matching so an in-flight workflow
 * consumes the reply instead of it starting a new flow. Returns true if it resumed.
 */
export async function resumeWaitingWorkflow(
  prisma: PrismaClient,
  queue: Queue,
  ctx: { accountId: string; contactScopedId: string; text: string },
): Promise<boolean> {
  const run = await prisma.workflowRun.findFirst({
    where: {
      instagramAccountId: ctx.accountId,
      contactScopedId: ctx.contactScopedId,
      status: 'WAITING',
      waitKind: 'reply',
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, waitExpiresAt: true },
  });
  if (!run) return false;
  if (run.waitExpiresAt && run.waitExpiresAt.getTime() <= Date.now()) {
    await prisma.workflowRun.update({
      where: { id: run.id },
      data: { status: 'CANCELED', lastError: 'wait_timeout', completedAt: new Date() },
    });
    return false;
  }
  await prisma.workflowRun.update({ where: { id: run.id }, data: { status: 'RUNNING' } });
  await queue.add(WORKFLOW_JOB_NAMES.RUN_WORKFLOW, { runId: run.id, resumeText: ctx.text });
  logger.info({ stage: 'workflow', runId: run.id }, 'workflow run resumed by reply');
  return true;
}

// ---------------------------------------------------------------------------
// Execution worker
// ---------------------------------------------------------------------------

export function createWorkflowExecutionWorker(options: {
  connection: ConnectionOptions;
  deps: WorkflowEngineDeps;
  queue: Queue;
  concurrency?: number;
}): Worker {
  const { connection, deps, queue, concurrency = 5 } = options;
  const worker: Worker = new Worker(
    QUEUE_NAMES.WORKFLOW_EXECUTION,
    async (job: Job<RunWorkflowJob>) => {
      try {
        await runWorkflow(job.data, deps, queue);
      } catch (error) {
        // Same treatment as the automation worker: a Meta throttle pauses this
        // worker and requeues the run without burning a retry attempt, instead
        // of hammering the API and losing the run.
        if (error instanceof InstagramApiError && error.isRateLimited) {
          const waitMs = error.backoffMs;
          logger.warn(
            { stage: 'workflow', jobId: job.id, graphCode: error.graphCode, waitMs },
            'instagram rate limited — pausing workflow-execution worker',
          );
          await worker.rateLimit(waitMs);
          throw Worker.RateLimitError();
        }
        throw error;
      }
    },
    { connection, concurrency },
  );
  worker.on('failed', (job, err) => {
    logger.error({ stage: 'workflow', jobId: job?.id, err }, 'workflow-execution job failed');
  });
  worker.on('error', (err) => logger.error({ stage: 'workflow', err }, 'workflow-execution worker error'));
  return worker;
}

/** Walks the graph from the run's cursor until it completes, pauses, or fails. */
export async function runWorkflow(
  job: RunWorkflowJob,
  deps: WorkflowEngineDeps,
  queue: Queue,
): Promise<void> {
  const { prisma } = deps;
  const run = await prisma.workflowRun.findUnique({
    where: { id: job.runId },
    include: { workflow: { include: { nodes: true, edges: true } } },
  });
  if (!run) return;

  const isResume = job.resumeText != null || job.resume === true;
  const canProceed = run.status === 'RUNNING' || (run.status === 'WAITING' && isResume);
  if (!canProceed) return;

  const wf = run.workflow;
  const account = await prisma.instagramAccount.findFirst({
    where: { id: run.instagramAccountId, deletedAt: null },
    select: {
      id: true,
      status: true,
      accessTokenEncrypted: true,
      connectedByUserId: true,
      organization: { select: { isActive: true } },
    },
  });
  if (!account) return void stopRun(prisma, run.id, 'FAILED', 'no_account');
  if (!account.organization.isActive) return void stopRun(prisma, run.id, 'FAILED', 'org_suspended');
  if (account.status !== 'CONNECTED') return void stopRun(prisma, run.id, 'FAILED', 'needs_reconnect');

  if (run.status !== 'RUNNING') {
    await prisma.workflowRun.update({ where: { id: run.id }, data: { status: 'RUNNING' } });
  }

  const ctx: RunAccount = {
    id: account.id,
    organizationId: run.organizationId,
    accessTokenEncrypted: account.accessTokenEncrypted,
    connectedByUserId: account.connectedByUserId,
  };
  const vars = parseJson<Record<string, unknown>>(run.variables) ?? {};
  let pendingReply: string | undefined = job.resumeText ?? undefined; // consumed once, at the first wait node
  let currentNodeId = run.currentNodeId;
  let steps = 0;

  const advance = async (fromNodeId: string, handle?: string) => {
    currentNodeId = handle
      ? branchTarget(wf.edges, fromNodeId, handle)
      : firstEdgeTarget(wf.edges, fromNodeId);
    await prisma.workflowRun.update({
      where: { id: run.id },
      data: { currentNodeId, variables: JSON.stringify(vars) },
    });
  };

  const pause = async (nodeId: string, kind: 'reply' | 'delay') => {
    await prisma.workflowRun.update({
      where: { id: run.id },
      data: {
        status: 'WAITING',
        currentNodeId: nodeId,
        waitKind: kind,
        waitExpiresAt: kind === 'reply' ? new Date(Date.now() + DEFAULT_WAIT_HOURS * 3600_000) : null,
        variables: JSON.stringify(vars),
      },
    });
  };

  while (currentNodeId && steps < MAX_STEPS_PER_JOB) {
    steps++;
    const node = wf.nodes.find((n) => n.id === currentNodeId);
    if (!node) return void stopRun(prisma, run.id, 'FAILED', 'node_missing');
    const cfg = parseJson<Record<string, unknown>>(node.config) ?? {};

    // -- END -------------------------------------------------------------
    if (node.type === 'END') {
      await recordStep(prisma, run.id, node, 'ok');
      await completeRun(prisma, run.id, vars);
      return;
    }

    // -- SEND_MESSAGE ----------------------------------------------------
    if (node.type === 'SEND_MESSAGE') {
      const result = await sendWorkflowDm(deps, {
        account: ctx,
        contactScopedId: run.contactScopedId,
        text: renderText(String(cfg.text ?? ''), vars),
        runId: run.id,
        nodeId: node.id,
        stepSeq: steps,
      });
      await recordStep(prisma, run.id, node, result.ok ? 'ok' : 'failed', result.outcome);
      if (!result.ok) return void stopRun(prisma, run.id, 'FAILED', result.outcome);
      await advance(node.id);
      continue;
    }

    // -- DELAY (BullMQ delayed job) --------------------------------------
    if (node.type === 'DELAY') {
      const ms = delayMs(cfg);
      const nextId = firstEdgeTarget(wf.edges, node.id);
      await recordStep(prisma, run.id, node, 'waiting', `delay_ms:${ms}`);
      await prisma.workflowRun.update({
        where: { id: run.id },
        data: { status: 'WAITING', currentNodeId: nextId, waitKind: 'delay', variables: JSON.stringify(vars) },
      });
      await queue.add(
        WORKFLOW_JOB_NAMES.RUN_WORKFLOW,
        { runId: run.id, resume: true } satisfies RunWorkflowJob,
        { delay: ms },
      );
      return;
    }

    // -- WAIT_REPLY ------------------------------------------------------
    if (node.type === 'WAIT_REPLY') {
      if (pendingReply !== undefined) {
        vars.lastReply = pendingReply;
        pendingReply = undefined;
        await recordStep(prisma, run.id, node, 'ok');
        await advance(node.id);
        continue;
      }
      await recordStep(prisma, run.id, node, 'waiting');
      await pause(node.id, 'reply');
      return;
    }

    // -- COLLECT_INPUT (send prompt → wait → validate → save) ------------
    if (node.type === 'COLLECT_INPUT') {
      const inputType = (cfg.inputType as string) === 'phone' ? 'phone' : 'email';
      const maxAttempts = Number(cfg.maxAttempts ?? 3);

      if (pendingReply !== undefined) {
        const reply = pendingReply;
        pendingReply = undefined;
        vars.lastReply = reply;
        const value = validateInput(inputType, reply);
        if (value) {
          await saveContactField(prisma, ctx, run.contactScopedId, inputType, value);
          vars[inputType] = value;
          await recordStep(prisma, run.id, node, 'ok', inputType);
          await advance(node.id);
          continue;
        }
        const attempts = Number(vars.__collectAttempts ?? 0) + 1;
        vars.__collectAttempts = attempts;
        if (attempts < maxAttempts) {
          const retry = renderText(String(cfg.retryMessage ?? `That doesn't look like a valid ${inputType}. Try again?`), vars);
          await sendWorkflowDm(deps, { account: ctx, contactScopedId: run.contactScopedId, text: retry, runId: run.id, nodeId: node.id, stepSeq: steps });
          await recordStep(prisma, run.id, node, 'waiting', 'retry');
          await pause(node.id, 'reply');
          return;
        }
        await recordStep(prisma, run.id, node, 'skipped', 'max_attempts');
        await advance(node.id);
        continue;
      }

      // First visit → ask, then wait.
      const prompt = renderText(String(cfg.prompt ?? `What's your ${inputType}?`), vars);
      const sent = await sendWorkflowDm(deps, { account: ctx, contactScopedId: run.contactScopedId, text: prompt, runId: run.id, nodeId: node.id, stepSeq: steps });
      if (!sent.ok) return void stopRun(prisma, run.id, 'FAILED', sent.outcome);
      vars.__collectAttempts = 0;
      await recordStep(prisma, run.id, node, 'waiting', 'prompt_sent');
      await pause(node.id, 'reply');
      return;
    }

    // -- CONDITION (binary: match / else on the last reply) --------------
    if (node.type === 'CONDITION') {
      const reply = String(vars.lastReply ?? vars.triggerText ?? '');
      const matchType = (cfg.matchType ?? 'CONTAINS') as TriggerMatchType;
      const matched = matchesKeywords(reply, matchType, (cfg.keywords as string[]) ?? []);
      const handle = matched ? 'match' : 'else';
      await recordStep(prisma, run.id, node, 'ok', handle);
      const target =
        branchTarget(wf.edges, node.id, handle) ?? firstEdgeTarget(wf.edges, node.id);
      currentNodeId = target;
      await prisma.workflowRun.update({
        where: { id: run.id },
        data: { currentNodeId, variables: JSON.stringify(vars) },
      });
      continue;
    }

    // -- ACTION (tag / subscribe / send link) ----------------------------
    if (node.type === 'ACTION') {
      const outcome = await applyAction(deps, ctx, run.contactScopedId, cfg, vars, run.id, steps);
      await recordStep(prisma, run.id, node, 'ok', outcome);
      await advance(node.id);
      continue;
    }

    // -- HANDOFF (flag a human, pause) -----------------------------------
    if (node.type === 'HANDOFF') {
      await notifyHandoff(prisma, ctx, wf.id, run.contactScopedId, String(cfg.note ?? ''));
      await recordStep(prisma, run.id, node, 'waiting', 'handoff');
      await prisma.workflowRun.update({
        where: { id: run.id },
        data: { status: 'HANDOFF', currentNodeId: node.id, lastError: null, variables: JSON.stringify(vars) },
      });
      return;
    }

    // -- TRIGGER / unknown → pass through --------------------------------
    await recordStep(prisma, run.id, node, node.type === 'TRIGGER' ? 'ok' : 'skipped', node.type);
    await advance(node.id);
  }

  await completeRun(prisma, run.id, vars);
}

// ---------------------------------------------------------------------------
// Send with caps (reuses the SAME quota + rate-limit ledger as keyword automation)
// ---------------------------------------------------------------------------

async function sendWorkflowDm(
  deps: WorkflowEngineDeps,
  input: {
    account: RunAccount;
    contactScopedId: string;
    text: string;
    runId: string;
    nodeId: string;
    stepSeq: number;
  },
): Promise<{ ok: boolean; outcome: string }> {
  const { prisma, decryptor, metaClient } = deps;
  const { account, contactScopedId, text } = input;
  const org = account.organizationId;
  if (!text.trim()) return { ok: false, outcome: 'empty_text' };

  const contact = await prisma.contact.findUnique({
    where: {
      instagramAccountId_instagramScopedId: { instagramAccountId: account.id, instagramScopedId: contactScopedId },
    },
    select: { isSubscribed: true },
  });
  if (contact && !contact.isSubscribed) return { ok: false, outcome: 'unsubscribed' };

  const recentDms = await prisma.processedComment.count({
    where: {
      commenterId: contactScopedId,
      instagramAccountId: account.id,
      dmSent: true,
      createdAt: { gte: new Date(Date.now() - RATE_WINDOW_MS) },
    },
  });
  if (recentDms >= DEFAULT_MAX_DMS_PER_USER_PER_24H) return { ok: false, outcome: 'rate_limited' };

  const { limit: dmLimit, period } = await getDmQuota(prisma, org);
  const reserved = await incrementDmUsage(prisma, org, period);
  if (dmLimit !== null && reserved > dmLimit) {
    await decrementDmUsage(prisma, org, period);
    await notifyMonthlyDmLimit(prisma, org, account.connectedByUserId, period);
    return { ok: false, outcome: 'plan_limit_reached' };
  }

  const token = decryptor.decrypt(account.accessTokenEncrypted);
  try {
    await metaClient.sendDm(contactScopedId, text, token);
  } catch (error) {
    await decrementDmUsage(prisma, org, period);
    if (error instanceof InstagramApiError && error.isAuthError) {
      await prisma.instagramAccount.update({ where: { id: account.id }, data: { status: 'NEEDS_RECONNECT' } });
      return { ok: false, outcome: 'needs_reconnect' };
    }
    // A throttle is temporary, so it must NOT be swallowed as send_failed —
    // that would abandon the run. Rethrow it for the worker, which pauses and
    // requeues. Every other failure keeps its existing behaviour.
    if (error instanceof InstagramApiError && error.isRateLimited) throw error;
    return { ok: false, outcome: 'send_failed' };
  }

  const dedupKey = createHash('sha256')
    .update(`wf:${input.runId}:${input.nodeId}:${input.stepSeq}`)
    .digest('hex');
  try {
    await prisma.processedComment.create({
      data: {
        commentId: `wf:${input.runId}:${input.nodeId}:${input.stepSeq}`,
        dedupKey,
        commenterId: contactScopedId,
        mediaId: null,
        instagramAccountId: account.id,
        matched: true,
        dmSent: true,
        outcome: 'workflow_dm',
      },
    });
  } catch {
    // Duplicate ledger row on a job retry after a successful send — harmless.
  }
  return { ok: true, outcome: 'dm_sent' };
}

// ---------------------------------------------------------------------------
// Action / collect helpers
// ---------------------------------------------------------------------------

async function ensureContact(
  prisma: PrismaClient,
  account: RunAccount,
  contactScopedId: string,
): Promise<string> {
  const contact = await prisma.contact.upsert({
    where: {
      instagramAccountId_instagramScopedId: { instagramAccountId: account.id, instagramScopedId: contactScopedId },
    },
    update: { lastInteractionAt: new Date() },
    create: {
      organizationId: account.organizationId,
      instagramAccountId: account.id,
      instagramScopedId: contactScopedId,
      lastInteractionAt: new Date(),
    },
    select: { id: true },
  });
  return contact.id;
}

async function saveContactField(
  prisma: PrismaClient,
  account: RunAccount,
  contactScopedId: string,
  field: 'email' | 'phone',
  value: string,
): Promise<void> {
  await ensureContact(prisma, account, contactScopedId);
  await prisma.contact.update({
    where: {
      instagramAccountId_instagramScopedId: { instagramAccountId: account.id, instagramScopedId: contactScopedId },
    },
    data: { [field]: value, isSubscribed: true, lastInteractionAt: new Date() },
  });
}

async function applyAction(
  deps: WorkflowEngineDeps,
  account: RunAccount,
  contactScopedId: string,
  cfg: Record<string, unknown>,
  vars: Record<string, unknown>,
  runId: string,
  stepSeq: number,
): Promise<string> {
  const { prisma } = deps;
  const action = String(cfg.action ?? '');

  if (action === 'SUBSCRIBE' || action === 'UNSUBSCRIBE') {
    await ensureContact(prisma, account, contactScopedId);
    await prisma.contact.update({
      where: {
        instagramAccountId_instagramScopedId: { instagramAccountId: account.id, instagramScopedId: contactScopedId },
      },
      data: { isSubscribed: action === 'SUBSCRIBE' },
    });
    return action.toLowerCase();
  }

  if (action === 'ADD_TAG') {
    const name = String(cfg.tagName ?? '').trim();
    if (!name) return 'tag_noop';
    const contactId = await ensureContact(prisma, account, contactScopedId);
    const tag = await prisma.tag.upsert({
      where: { organizationId_name: { organizationId: account.organizationId, name } },
      update: {},
      create: { organizationId: account.organizationId, name },
      select: { id: true },
    });
    await prisma.contactTag
      .create({ data: { contactId, tagId: tag.id } })
      .catch(() => undefined); // already tagged
    return `tagged:${name}`;
  }

  if (action === 'SEND_LINK') {
    const text = [renderText(String(cfg.text ?? ''), vars), String(cfg.url ?? '')].filter(Boolean).join(' ');
    const res = await sendWorkflowDm(deps, { account, contactScopedId, text, runId, nodeId: 'action', stepSeq });
    return res.outcome;
  }

  return 'action_noop';
}

async function notifyHandoff(
  prisma: PrismaClient,
  account: RunAccount,
  workflowId: string,
  contactScopedId: string,
  note: string,
): Promise<void> {
  if (!account.connectedByUserId) return;
  await prisma.notification.create({
    data: {
      organizationId: account.organizationId,
      userId: account.connectedByUserId,
      type: 'SYSTEM',
      title: 'A workflow needs a human',
      body: `Contact ${contactScopedId} reached a Handoff step.${note ? ` Note: ${note}` : ''}`,
      metadata: JSON.stringify({ workflowId, contactScopedId }),
    },
  });
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function firstEdgeTarget(edges: EdgeRow[], fromNodeId: string): string | null {
  // A node with an unlabeled edge (or the first edge) — used by linear nodes.
  const plain = edges.find((e) => e.sourceNodeId === fromNodeId && !e.sourceHandle);
  return (plain ?? edges.find((e) => e.sourceNodeId === fromNodeId))?.targetNodeId ?? null;
}

function branchTarget(edges: EdgeRow[], fromNodeId: string, handle: string): string | null {
  return edges.find((e) => e.sourceNodeId === fromNodeId && e.sourceHandle === handle)?.targetNodeId ?? null;
}

function delayMs(cfg: Record<string, unknown>): number {
  const amount = Math.max(1, Number(cfg.amount ?? cfg.minutes ?? 1));
  const unit = String(cfg.unit ?? (cfg.minutes != null ? 'minutes' : 'minutes'));
  const per = unit === 'hours' ? 3600_000 : unit === 'days' ? 86_400_000 : 60_000;
  return amount * per;
}

function validateInput(kind: 'email' | 'phone', text: string): string | null {
  const m = text.match(kind === 'email' ? EMAIL_RE : PHONE_RE);
  if (!m) return null;
  return kind === 'email' ? m[0].toLowerCase() : m[0].replace(/[^\d+]/g, '');
}

/** Minimal `{{var}}` interpolation from the run's collected variables. */
function renderText(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    return v == null ? '' : String(v);
  });
}

async function recordStep(
  prisma: PrismaClient,
  runId: string,
  node: NodeRow,
  status: string,
  detail?: string,
): Promise<void> {
  await prisma.workflowRunStep.create({
    data: { runId, nodeId: node.id, nodeType: node.type, status, detail: detail ?? null },
  });
}

async function completeRun(prisma: PrismaClient, runId: string, vars: Record<string, unknown>): Promise<void> {
  await prisma.workflowRun.update({
    where: { id: runId },
    data: { status: 'COMPLETED', currentNodeId: null, completedAt: new Date(), variables: JSON.stringify(vars) },
  });
}

async function stopRun(
  prisma: PrismaClient,
  runId: string,
  status: 'FAILED' | 'CANCELED',
  reason: string,
): Promise<void> {
  logger.info({ stage: 'workflow', runId, outcome: reason }, 'workflow run stopped');
  await prisma.workflowRun.update({
    where: { id: runId },
    data: { status, lastError: reason, completedAt: new Date() },
  });
}
