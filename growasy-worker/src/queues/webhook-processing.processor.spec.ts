import type { Queue } from 'bullmq';
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { processWebhookComment, processWebhookMessage } from './webhook-processing.processor';
import type { ProcessInstagramCommentJob } from './queue-names.constant';

const BASE_JOB: ProcessInstagramCommentJob = {
  commentId: 'c-1',
  mediaId: 'm-1',
  commentText: 'what is the price?',
  commenterId: 'user-9',
  commenterUsername: 'buyer',
  instagramBusinessAccountId: 'ig-biz-1',
  rawEventTimestamp: 1700000000,
};

const CONNECTED_ACCOUNT = {
  id: 'acc-1',
  organizationId: 'org-1',
  instagramBusinessId: 'ig-biz-1',
  status: 'CONNECTED',
  organization: { isActive: true },
};

function priceRule() {
  return {
    id: 'rule-1',
    priority: 0,
    triggers: [
      {
        type: 'COMMENT_KEYWORD',
        matchType: 'CONTAINS',
        keywords: JSON.stringify(['price']),
        config: JSON.stringify({}),
      },
    ],
  };
}

function makePrisma(overrides: Record<string, unknown> = {}): PrismaClient {
  return {
    processedComment: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'pc-1' }),
    },
    instagramAccount: {
      findFirst: vi.fn().mockResolvedValue(CONNECTED_ACCOUNT),
    },
    automationRule: {
      findMany: vi.fn().mockResolvedValue([priceRule()]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    contact: { upsert: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({}) },
    pendingLeadCapture: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    // No active workflows by default — keyword-automation tests exercise the
    // fall-through path after workflows decline the event.
    workflow: { findMany: vi.fn().mockResolvedValue([]) },
    workflowRun: {
      create: vi.fn().mockResolvedValue({ id: 'wfr-1' }),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  } as unknown as PrismaClient;
}

function makeQueue(): Queue {
  return { add: vi.fn().mockResolvedValue(undefined) } as unknown as Queue;
}

/** Deps for the processors, including the workflow queue added by the engine. */
function deps(prisma: PrismaClient, automationQueue: Queue) {
  return { prisma, automationQueue, workflowQueue: makeQueue() };
}

describe('processWebhookComment', () => {
  it('enqueues an automation-execution job when a rule matches', async () => {
    const prisma = makePrisma();
    const automationQueue = makeQueue();

    await processWebhookComment(BASE_JOB, deps(prisma, automationQueue));

    expect(automationQueue.add).toHaveBeenCalledWith(
      'execute-automation',
      expect.objectContaining({
        ruleId: 'rule-1',
        source: 'comment',
        eventId: 'c-1',
        instagramAccountId: 'acc-1',
      }),
      expect.objectContaining({ jobId: 'ax-c-1-rule-1' }),
    );
  });

  it('matches a DM_KEYWORD rule on an incoming message and enqueues a message job', async () => {
    const dmRule = {
      id: 'rule-dm',
      priority: 0,
      triggers: [
        {
          type: 'DM_KEYWORD',
          matchType: 'CONTAINS',
          keywords: JSON.stringify(['price']),
          config: JSON.stringify({}),
        },
      ],
    };
    const prisma = makePrisma({
      automationRule: { findMany: vi.fn().mockResolvedValue([dmRule]) },
    });
    const automationQueue = makeQueue();

    await processWebhookMessage(
      {
        messageId: 'msg-1',
        text: 'what is the price?',
        senderId: 'sender-9',
        isStoryReply: false,
        instagramBusinessAccountId: 'ig-biz-1',
        rawEventTimestamp: 1,
      },
      deps(prisma, automationQueue),
    );

    expect(automationQueue.add).toHaveBeenCalledWith(
      'execute-automation',
      expect.objectContaining({
        ruleId: 'rule-dm',
        source: 'message',
        eventId: 'msg-1',
        recipientId: 'sender-9',
      }),
      expect.objectContaining({ jobId: 'ax-msg-1-rule-dm' }),
    );
  });

  it('short-circuits a duplicate comment without enqueuing', async () => {
    const prisma = makePrisma({
      processedComment: {
        findUnique: vi.fn().mockResolvedValue({ id: 'pc-existing' }),
        create: vi.fn(),
      },
    });
    const automationQueue = makeQueue();

    await processWebhookComment(BASE_JOB, deps(prisma, automationQueue));

    expect(automationQueue.add).not.toHaveBeenCalled();
    expect(prisma.processedComment.create as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('records no_match and does not enqueue when no rule matches', async () => {
    const prisma = makePrisma({
      automationRule: { findMany: vi.fn().mockResolvedValue([]) },
    });
    const automationQueue = makeQueue();

    await processWebhookComment(BASE_JOB, deps(prisma, automationQueue));

    expect(automationQueue.add).not.toHaveBeenCalled();
    expect(prisma.processedComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ outcome: 'no_match', matched: false }),
      }),
    );
  });

  // --- per-post targeting -----------------------------------------------------
  // A rule may name several posts (config.mediaIds). Rules written before that
  // existed carry a single config.mediaId and are still live in production, so
  // both shapes have to keep working.

  /** Comment rule limited to the given posts, in either config shape. */
  function scopedRule(config: Record<string, unknown>) {
    return {
      id: 'rule-1',
      priority: 0,
      triggers: [
        {
          type: 'COMMENT_KEYWORD',
          matchType: 'CONTAINS',
          keywords: JSON.stringify(['price']),
          config: JSON.stringify(config),
        },
      ],
    };
  }

  async function matchedAgainst(config: Record<string, unknown>, mediaId: string | null) {
    const prisma = makePrisma({
      automationRule: { findMany: vi.fn().mockResolvedValue([scopedRule(config)]) },
    });
    const automationQueue = makeQueue();
    await processWebhookComment({ ...BASE_JOB, mediaId }, deps(prisma, automationQueue));
    return (automationQueue.add as ReturnType<typeof vi.fn>).mock.calls.length > 0;
  }

  it('fires on any post when no media filter is set', async () => {
    expect(await matchedAgainst({}, 'm-9')).toBe(true);
  });

  it('fires on every post listed in mediaIds', async () => {
    const config = { mediaIds: ['m-1', 'm-2', 'm-3'] };
    expect(await matchedAgainst(config, 'm-1')).toBe(true);
    expect(await matchedAgainst(config, 'm-3')).toBe(true);
  });

  it('does not fire on a post outside mediaIds', async () => {
    expect(await matchedAgainst({ mediaIds: ['m-1', 'm-2'] }, 'm-99')).toBe(false);
  });

  it('still honours the legacy single mediaId config', async () => {
    expect(await matchedAgainst({ mediaId: 'm-1' }, 'm-1')).toBe(true);
    expect(await matchedAgainst({ mediaId: 'm-1' }, 'm-2')).toBe(false);
  });

  it('treats an empty mediaIds list as "every post"', async () => {
    expect(await matchedAgainst({ mediaIds: [] }, 'm-7')).toBe(true);
  });

  it('does not fire a post-scoped rule when the event carries no media id', async () => {
    expect(await matchedAgainst({ mediaIds: ['m-1'] }, null)).toBe(false);
  });

  // --- story mentions ---------------------------------------------------------
  // Someone resharing our post to their story is the reach signal worth
  // rewarding. It arrives as a message with no text, so it needs its own path.

  function storyMentionRule() {
    return {
      id: 'rule-sm',
      priority: 0,
      triggers: [
        {
          type: 'STORY_MENTION',
          matchType: 'CONTAINS',
          keywords: JSON.stringify([]),
          config: JSON.stringify({}),
        },
      ],
    };
  }

  it('fires a STORY_MENTION rule on a mention with no text', async () => {
    const prisma = makePrisma({
      automationRule: { findMany: vi.fn().mockResolvedValue([storyMentionRule()]) },
    });
    const automationQueue = makeQueue();

    await processWebhookMessage(
      {
        messageId: 'mid-1',
        text: '',
        senderId: 'user-9',
        isStoryReply: false,
        isStoryMention: true,
        instagramBusinessAccountId: 'ig-biz-1',
        rawEventTimestamp: 1700000000,
      },
      deps(prisma, automationQueue),
    );

    expect(automationQueue.add).toHaveBeenCalled();
  });

  it('does not fire a DM_KEYWORD rule on a story mention', async () => {
    const dmRule = {
      id: 'rule-dm',
      priority: 0,
      triggers: [
        {
          type: 'DM_KEYWORD',
          matchType: 'ANY',
          keywords: JSON.stringify([]),
          config: JSON.stringify({}),
        },
      ],
    };
    const prisma = makePrisma({
      automationRule: { findMany: vi.fn().mockResolvedValue([dmRule]) },
    });
    const automationQueue = makeQueue();

    await processWebhookMessage(
      {
        messageId: 'mid-2',
        text: '',
        senderId: 'user-9',
        isStoryReply: false,
        isStoryMention: true,
        instagramBusinessAccountId: 'ig-biz-1',
        rawEventTimestamp: 1700000000,
      },
      deps(prisma, automationQueue),
    );

    expect(automationQueue.add).not.toHaveBeenCalled();
  });

  it('does not fire a STORY_MENTION rule on an ordinary DM', async () => {
    const prisma = makePrisma({
      automationRule: { findMany: vi.fn().mockResolvedValue([storyMentionRule()]) },
    });
    const automationQueue = makeQueue();

    await processWebhookMessage(
      {
        messageId: 'mid-3',
        text: 'hello there',
        senderId: 'user-9',
        isStoryReply: false,
        instagramBusinessAccountId: 'ig-biz-1',
        rawEventTimestamp: 1700000000,
      },
      deps(prisma, automationQueue),
    );

    expect(automationQueue.add).not.toHaveBeenCalled();
  });

  it('skips accounts that are not CONNECTED', async () => {
    const prisma = makePrisma({
      instagramAccount: {
        findFirst: vi.fn().mockResolvedValue({ ...CONNECTED_ACCOUNT, status: 'NEEDS_RECONNECT' }),
      },
    });
    const automationQueue = makeQueue();

    await processWebhookComment(BASE_JOB, deps(prisma, automationQueue));

    expect(automationQueue.add).not.toHaveBeenCalled();
    expect(prisma.processedComment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ outcome: 'needs_reconnect' }) }),
    );
  });

  it('skips events for a suspended organization', async () => {
    const prisma = makePrisma({
      instagramAccount: {
        findFirst: vi.fn().mockResolvedValue({ ...CONNECTED_ACCOUNT, organization: { isActive: false } }),
      },
    });
    const automationQueue = makeQueue();

    await processWebhookComment(BASE_JOB, deps(prisma, automationQueue));

    expect(automationQueue.add).not.toHaveBeenCalled();
    expect(prisma.processedComment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ outcome: 'org_suspended' }) }),
    );
  });

  it("ignores the account's own comments", async () => {
    const prisma = makePrisma();
    const automationQueue = makeQueue();

    await processWebhookComment(
      { ...BASE_JOB, commenterId: 'ig-biz-1' },
      deps(prisma, automationQueue),
    );

    expect(automationQueue.add).not.toHaveBeenCalled();
    expect(prisma.processedComment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ outcome: 'self_comment' }) }),
    );
  });

  it('intercepts an email reply, saves it to the contact, and enqueues the confirmation DM', async () => {
    const capture = {
      id: 'cap-1',
      ruleId: 'rule-1',
      status: 'AWAITING',
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
    };
    const prisma = makePrisma({
      pendingLeadCapture: {
        findUnique: vi.fn().mockResolvedValue(capture),
        update: vi.fn().mockResolvedValue({}),
      },
      automationRule: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue({
          id: 'rule-1',
          actions: [
            { type: 'SEND_DM', config: JSON.stringify({ text: 'email?', emailSuccessMessage: 'Thanks! 🎉' }) },
          ],
        }),
      },
    });
    const automationQueue = makeQueue();

    await processWebhookMessage(
      {
        messageId: 'msg-email',
        text: 'sure, it is Buyer@Example.com !',
        senderId: 'sender-9',
        isStoryReply: false,
        instagramBusinessAccountId: 'ig-biz-1',
        rawEventTimestamp: 1,
      },
      deps(prisma, automationQueue),
    );

    // Email saved (lowercased) to the contact.
    expect(prisma.contact.updateMany as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'buyer@example.com', isSubscribed: true }),
      }),
    );
    // Capture marked COMPLETED.
    expect(prisma.pendingLeadCapture.update as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }),
    );
    // Confirmation DM enqueued via the lead-reply job.
    expect(automationQueue.add).toHaveBeenCalledWith(
      'send-lead-reply',
      expect.objectContaining({ recipientId: 'sender-9', text: 'Thanks! 🎉' }),
      expect.objectContaining({ jobId: 'lead-reply-msg-email' }),
    );
  });

  it('bumps the attempt and sends the retry DM when the reply is not an email', async () => {
    const capture = {
      id: 'cap-2',
      ruleId: 'rule-1',
      status: 'AWAITING',
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
    };
    const prisma = makePrisma({
      pendingLeadCapture: {
        findUnique: vi.fn().mockResolvedValue(capture),
        update: vi.fn().mockResolvedValue({}),
      },
      automationRule: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue({
          id: 'rule-1',
          actions: [
            { type: 'SEND_DM', config: JSON.stringify({ text: 'email?', emailFailureMessage: 'Try again?' }) },
          ],
        }),
      },
    });
    const automationQueue = makeQueue();

    await processWebhookMessage(
      {
        messageId: 'msg-nope',
        text: 'no thanks',
        senderId: 'sender-9',
        isStoryReply: false,
        instagramBusinessAccountId: 'ig-biz-1',
        rawEventTimestamp: 1,
      },
      deps(prisma, automationQueue),
    );

    expect(prisma.pendingLeadCapture.update as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ attempts: 1, status: 'AWAITING' }) }),
    );
    expect(automationQueue.add).toHaveBeenCalledWith(
      'send-lead-reply',
      expect.objectContaining({ text: 'Try again?' }),
      expect.anything(),
    );
    expect(prisma.contact.updateMany as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('does not intercept when the capture window has expired', async () => {
    const prisma = makePrisma({
      pendingLeadCapture: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'cap-3',
          ruleId: 'rule-1',
          status: 'AWAITING',
          attempts: 0,
          expiresAt: new Date(Date.now() - 1000), // already expired
        }),
        update: vi.fn(),
      },
    });
    const automationQueue = makeQueue();

    await processWebhookMessage(
      {
        messageId: 'msg-late',
        text: 'late@example.com',
        senderId: 'sender-9',
        isStoryReply: false,
        instagramBusinessAccountId: 'ig-biz-1',
        rawEventTimestamp: 1,
      },
      deps(prisma, automationQueue),
    );

    // Falls through to normal matching → no lead reply enqueued.
    expect(automationQueue.add).not.toHaveBeenCalledWith(
      'send-lead-reply',
      expect.anything(),
      expect.anything(),
    );
  });

  it('unsubscribes the contact and stops on an opt-out DM', async () => {
    const prisma = makePrisma({
      contact: { upsert: vi.fn().mockResolvedValue({}), updateMany: vi.fn() },
      automationRule: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
    });
    const automationQueue = makeQueue();

    await processWebhookMessage(
      {
        messageId: 'msg-stop',
        text: 'STOP',
        senderId: 'sender-9',
        isStoryReply: false,
        instagramBusinessAccountId: 'ig-biz-1',
        rawEventTimestamp: 1,
      },
      deps(prisma, automationQueue),
    );

    expect(prisma.contact.upsert as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.objectContaining({ update: { isSubscribed: false } }),
    );
    expect(automationQueue.add).not.toHaveBeenCalled();
    expect(prisma.processedComment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ outcome: 'opted_out' }) }),
    );
  });

  it('does not enqueue twice when the ledger insert loses a race (P2002)', async () => {
    const p2002 = Object.assign(new Error('unique'), { code: 'P2002' });
    Object.setPrototypeOf(
      p2002,
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@prisma/client').Prisma.PrismaClientKnownRequestError.prototype,
    );
    const prisma = makePrisma({
      processedComment: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(p2002),
      },
    });
    const automationQueue = makeQueue();

    await processWebhookComment(BASE_JOB, deps(prisma, automationQueue));

    expect(automationQueue.add).not.toHaveBeenCalled();
  });
});
