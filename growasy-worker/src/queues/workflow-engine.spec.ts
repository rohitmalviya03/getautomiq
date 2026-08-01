import type { PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

import { matchAndStartWorkflow, runWorkflow } from './workflow-engine';
import type { TokenDecryptor } from '../crypto/token-encryption';
import type { MetaGraphClient } from '../instagram/meta-graph.client';

function makeQueue(): Queue {
  return { add: vi.fn().mockResolvedValue(undefined) } as unknown as Queue;
}
function makeDecryptor(): TokenDecryptor {
  return { decrypt: vi.fn().mockReturnValue('plain-token') } as unknown as TokenDecryptor;
}
function makeMetaClient(): MetaGraphClient {
  return { sendDm: vi.fn().mockResolvedValue({ messageId: 'mid-1' }) } as unknown as MetaGraphClient;
}

const TRIGGER_NODE = {
  id: 't',
  type: 'TRIGGER',
  config: JSON.stringify({ triggerType: 'DM_KEYWORD', matchType: 'CONTAINS', keywords: ['price'] }),
};

function matchPrisma(overrides: Record<string, unknown> = {}): PrismaClient {
  return {
    workflow: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'wf-1',
          priority: 0,
          nodes: [TRIGGER_NODE],
          edges: [{ sourceNodeId: 't', targetNodeId: 'n-send' }],
        },
      ]),
    },
    workflowRun: { create: vi.fn().mockResolvedValue({ id: 'wfr-1' }) },
    ...overrides,
  } as unknown as PrismaClient;
}

describe('matchAndStartWorkflow', () => {
  const ctx = {
    accountId: 'acc-1',
    organizationId: 'org-1',
    source: 'message' as const,
    contactScopedId: 'user-9',
    text: 'what is the price?',
    isStoryReply: false,
  };

  it('claims the event, creates a run at the trigger target, and enqueues it', async () => {
    const prisma = matchPrisma();
    const queue = makeQueue();

    const claimed = await matchAndStartWorkflow(prisma, queue, ctx);

    expect(claimed).toBe(true);
    expect(prisma.workflowRun.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currentNodeId: 'n-send', status: 'RUNNING' }) }),
    );
    expect(queue.add).toHaveBeenCalledWith('run-workflow', { runId: 'wfr-1' }, expect.any(Object));
  });

  it('does not claim when the keyword does not match', async () => {
    const prisma = matchPrisma();
    const queue = makeQueue();

    const claimed = await matchAndStartWorkflow(prisma, queue, { ...ctx, text: 'just saying hello' });

    expect(claimed).toBe(false);
    expect(prisma.workflowRun.create).not.toHaveBeenCalled();
  });

  it('does not claim a DM_KEYWORD workflow for a comment event', async () => {
    const prisma = matchPrisma();
    const claimed = await matchAndStartWorkflow(prisma, makeQueue(), { ...ctx, source: 'comment' });
    expect(claimed).toBe(false);
  });
});

describe('runWorkflow', () => {
  function runPrisma(overrides: Record<string, unknown> = {}): PrismaClient {
    return {
      workflowRun: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'wfr-1',
          status: 'RUNNING',
          organizationId: 'org-1',
          instagramAccountId: 'acc-1',
          contactScopedId: 'user-9',
          currentNodeId: 'n-send',
          variables: JSON.stringify({ triggerText: 'price?' }),
          workflow: {
            nodes: [
              { id: 'n-send', type: 'SEND_MESSAGE', config: JSON.stringify({ text: 'Hello!' }) },
              { id: 'n-end', type: 'END', config: '{}' },
            ],
            edges: [{ sourceNodeId: 'n-send', targetNodeId: 'n-end' }],
          },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      workflowRunStep: { create: vi.fn().mockResolvedValue({}) },
      instagramAccount: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'acc-1',
          status: 'CONNECTED',
          accessTokenEncrypted: 'enc',
          connectedByUserId: 'u-1',
          organization: { isActive: true },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      contact: { findUnique: vi.fn().mockResolvedValue(null) },
      processedComment: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({}),
      },
      subscription: { findUnique: vi.fn().mockResolvedValue(null) },
      usageTracking: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({ count: 1 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      notification: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
      ...overrides,
    } as unknown as PrismaClient;
  }

  it('sends the DM through caps and completes the run', async () => {
    const prisma = runPrisma();
    const metaClient = makeMetaClient();

    await runWorkflow({ runId: 'wfr-1' }, { prisma, decryptor: makeDecryptor(), metaClient }, makeQueue());

    expect(metaClient.sendDm).toHaveBeenCalledWith('user-9', 'Hello!', 'plain-token');
    // reserved a monthly-quota slot
    expect(prisma.usageTracking.upsert).toHaveBeenCalled();
    // recorded the send in the shared rate-limit ledger
    expect(prisma.processedComment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ dmSent: true, outcome: 'workflow_dm' }) }),
    );
    // run ends COMPLETED
    expect(prisma.workflowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }),
    );
  });

  it('does not send when the contact has opted out', async () => {
    const prisma = runPrisma({ contact: { findUnique: vi.fn().mockResolvedValue({ isSubscribed: false }) } });
    const metaClient = makeMetaClient();

    await runWorkflow({ runId: 'wfr-1' }, { prisma, decryptor: makeDecryptor(), metaClient }, makeQueue());

    expect(metaClient.sendDm).not.toHaveBeenCalled();
    expect(prisma.workflowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', lastError: 'unsubscribed' }) }),
    );
  });
});

// -- Phase 2 node types -------------------------------------------------------

interface GraphOpts {
  nodes: Array<{ id: string; type: string; config?: unknown }>;
  edges: Array<{ sourceNodeId: string; targetNodeId: string; sourceHandle?: string }>;
  currentNodeId: string;
  status?: string;
  variables?: Record<string, unknown>;
}

function graphPrisma(opts: GraphOpts, overrides: Record<string, unknown> = {}): PrismaClient {
  return {
    workflowRun: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'wfr-1',
        status: opts.status ?? 'RUNNING',
        organizationId: 'org-1',
        instagramAccountId: 'acc-1',
        contactScopedId: 'user-9',
        currentNodeId: opts.currentNodeId,
        variables: JSON.stringify(opts.variables ?? {}),
        workflow: {
          nodes: opts.nodes.map((n) => ({ ...n, config: JSON.stringify(n.config ?? {}) })),
          edges: opts.edges,
        },
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    workflowRunStep: { create: vi.fn().mockResolvedValue({}) },
    instagramAccount: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'acc-1',
        status: 'CONNECTED',
        accessTokenEncrypted: 'enc',
        connectedByUserId: 'u-1',
        organization: { isActive: true },
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    contact: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ id: 'contact-1' }),
      update: vi.fn().mockResolvedValue({}),
    },
    processedComment: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({}) },
    subscription: { findUnique: vi.fn().mockResolvedValue(null) },
    usageTracking: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ count: 1 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    notification: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
    ...overrides,
  } as unknown as PrismaClient;
}

describe('runWorkflow — Phase 2 nodes', () => {
  const deps = () => ({ prisma: undefined as never, decryptor: makeDecryptor(), metaClient: makeMetaClient() });

  it('DELAY schedules a delayed resume job and pauses (WAITING/delay)', async () => {
    const prisma = graphPrisma({
      nodes: [
        { id: 'd', type: 'DELAY', config: { amount: 5, unit: 'minutes' } },
        { id: 'end', type: 'END' },
      ],
      edges: [{ sourceNodeId: 'd', targetNodeId: 'end' }],
      currentNodeId: 'd',
    });
    const queue = makeQueue();

    await runWorkflow({ runId: 'wfr-1' }, { ...deps(), prisma }, queue);

    expect(queue.add).toHaveBeenCalledWith('run-workflow', { runId: 'wfr-1', resume: true }, { delay: 300000 });
    expect(prisma.workflowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'WAITING', waitKind: 'delay', currentNodeId: 'end' }) }),
    );
  });

  it('WAIT_REPLY pauses on first visit, then advances when a reply resumes it', async () => {
    const graph: GraphOpts = {
      nodes: [
        { id: 'w', type: 'WAIT_REPLY' },
        { id: 'end', type: 'END' },
      ],
      edges: [{ sourceNodeId: 'w', targetNodeId: 'end' }],
      currentNodeId: 'w',
    };
    const pausePrisma = graphPrisma(graph);
    await runWorkflow({ runId: 'wfr-1' }, { ...deps(), prisma: pausePrisma }, makeQueue());
    expect(pausePrisma.workflowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'WAITING', waitKind: 'reply' }) }),
    );

    // Resume: status WAITING + resumeText → consumes reply, advances to END, completes.
    const resumePrisma = graphPrisma({ ...graph, status: 'WAITING' });
    await runWorkflow({ runId: 'wfr-1', resumeText: 'sure!' }, { ...deps(), prisma: resumePrisma }, makeQueue());
    expect(resumePrisma.workflowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }),
    );
  });

  it('CONDITION follows the match branch when the reply matches', async () => {
    const prisma = graphPrisma({
      nodes: [
        { id: 'c', type: 'CONDITION', config: { matchType: 'CONTAINS', keywords: ['yes'] } },
        { id: 'end-yes', type: 'END' },
        { id: 'end-no', type: 'END' },
      ],
      edges: [
        { sourceNodeId: 'c', targetNodeId: 'end-yes', sourceHandle: 'match' },
        { sourceNodeId: 'c', targetNodeId: 'end-no', sourceHandle: 'else' },
      ],
      currentNodeId: 'c',
      variables: { lastReply: 'yes please' },
    });

    await runWorkflow({ runId: 'wfr-1' }, { ...deps(), prisma }, makeQueue());

    // advanced to the 'match' target
    expect(prisma.workflowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currentNodeId: 'end-yes' }) }),
    );
  });

  it('COLLECT_INPUT saves a valid email and advances', async () => {
    const prisma = graphPrisma(
      {
        nodes: [
          { id: 'col', type: 'COLLECT_INPUT', config: { inputType: 'email', prompt: 'email?' } },
          { id: 'end', type: 'END' },
        ],
        edges: [{ sourceNodeId: 'col', targetNodeId: 'end' }],
        currentNodeId: 'col',
        status: 'WAITING',
      },
    );

    await runWorkflow({ runId: 'wfr-1', resumeText: 'me@example.com' }, { ...deps(), prisma }, makeQueue());

    expect(prisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: 'me@example.com' }) }),
    );
    expect(prisma.workflowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }),
    );
  });
});
