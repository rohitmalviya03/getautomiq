import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { processAutomationExecution, processSendLeadReply } from './automation-execution.processor';
import type { ExecuteAutomationJob, SendLeadReplyJob } from './queue-names.constant';
import type { TokenDecryptor } from '../crypto/token-encryption';
import { InstagramApiError, type MetaGraphClient } from '../instagram/meta-graph.client';

const JOB: ExecuteAutomationJob = {
  ruleId: 'rule-1',
  source: 'comment',
  eventId: 'c-1',
  commenterId: 'user-9',
  recipientId: 'user-9',
  mediaId: 'm-1',
  instagramAccountId: 'acc-1',
};

function ruleWithDm(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rule-1',
    organizationId: 'org-1',
    instagramAccount: {
      id: 'acc-1',
      status: 'CONNECTED',
      accessTokenEncrypted: 'enc-token',
      connectedByUserId: 'user-1',
    },
    triggers: [{ config: JSON.stringify({ maxDmsPerUserPer24h: 1 }) }],
    actions: [{ type: 'SEND_DM', order: 0, config: JSON.stringify({ text: 'Hi {{username}}!' }) }],
    ...overrides,
  };
}

function makePrisma(overrides: Record<string, unknown> = {}): PrismaClient {
  return {
    automationRule: { findFirst: vi.fn().mockResolvedValue(ruleWithDm()) },
    processedComment: {
      count: vi.fn().mockResolvedValue(0),
      upsert: vi.fn().mockResolvedValue({ id: 'pc-1' }),
    },
    instagramAccount: {
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue({
        id: 'acc-1',
        status: 'CONNECTED',
        accessTokenEncrypted: 'enc-token',
      }),
    },
    pendingLeadCapture: { upsert: vi.fn().mockResolvedValue({}) },
    contact: { findUnique: vi.fn().mockResolvedValue(null) },
    // Billing: default to "no subscription" → DM limit not enforced.
    subscription: { findUnique: vi.fn().mockResolvedValue(null) },
    usageTracking: {
      findUnique: vi.fn().mockResolvedValue(null),
      // upsert reserves a slot and returns the new count (1 = well under any cap).
      upsert: vi.fn().mockResolvedValue({ count: 1 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    notification: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  } as unknown as PrismaClient;
}

function subscriptionWithDmLimit(max: number) {
  return {
    findUnique: vi.fn().mockResolvedValue({
      plan: { limits: JSON.stringify({ maxMessagesPerMonth: max }) },
    }),
  };
}

function makeDecryptor(): TokenDecryptor {
  return { decrypt: vi.fn().mockReturnValue('plain-token') } as unknown as TokenDecryptor;
}

function makeMetaClient(overrides: Partial<MetaGraphClient> = {}): MetaGraphClient {
  return {
    sendDmToComment: vi.fn().mockResolvedValue({ messageId: 'mid-1' }),
    sendDm: vi.fn().mockResolvedValue({ messageId: 'mid-2' }),
    replyToComment: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as MetaGraphClient;
}

describe('processAutomationExecution — A/B variants', () => {
  /** A rule whose SEND_DM carries alternatives alongside the main message. */
  function abRule() {
    return ruleWithDm({
      actions: [
        {
          type: 'SEND_DM',
          order: 0,
          config: JSON.stringify({ text: 'Version A', variants: ['Version B', 'Version C'] }),
        },
      ],
    });
  }

  it('sends one of the variants and records which one', async () => {
    const prisma = makePrisma({ automationRule: { findFirst: vi.fn().mockResolvedValue(abRule()) } });
    const metaClient = makeMetaClient();

    await processAutomationExecution(JOB, { prisma, decryptor: makeDecryptor(), metaClient });

    const sentText = (metaClient.sendDmToComment as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(['Version A', 'Version B', 'Version C']).toContain(sentText);

    const recorded = (prisma.processedComment.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(['A', 'B', 'C']).toContain(recorded.update.variantId);
  });

  // Recording a variant on a rule with one message would make the results panel
  // show a pointless single-row "test".
  it('records no variant when the rule has a single message', async () => {
    const prisma = makePrisma();
    const metaClient = makeMetaClient();

    await processAutomationExecution(JOB, { prisma, decryptor: makeDecryptor(), metaClient });

    const recorded = (prisma.processedComment.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(recorded.update.variantId).toBeUndefined();
  });

  it('spreads sends across the variants rather than always picking one', async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60; i += 1) {
      const prisma = makePrisma({
        automationRule: { findFirst: vi.fn().mockResolvedValue(abRule()) },
      });
      const metaClient = makeMetaClient();
      await processAutomationExecution(JOB, { prisma, decryptor: makeDecryptor(), metaClient });
      seen.add((metaClient.sendDmToComment as ReturnType<typeof vi.fn>).mock.calls[0][1] as string);
    }
    // With 60 draws over 3 options, hitting only one is ~2 in 10^28.
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('processAutomationExecution', () => {
  it('sends the DM and marks the comment dm_sent', async () => {
    const prisma = makePrisma();
    const metaClient = makeMetaClient();

    await processAutomationExecution(JOB, { prisma, decryptor: makeDecryptor(), metaClient });

    expect(metaClient.sendDmToComment).toHaveBeenCalledWith('c-1', 'Hi there!', 'plain-token');
    expect(prisma.processedComment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ dmSent: true, outcome: 'dm_sent' }),
      }),
    );
    // The sent DM is counted against the monthly quota.
    expect(prisma.usageTracking.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { count: { increment: 1 } } }),
    );
  });

  it('sends a direct DM (recipient.id) for a message-sourced automation', async () => {
    const prisma = makePrisma();
    const metaClient = makeMetaClient();
    const messageJob: ExecuteAutomationJob = {
      ...JOB,
      source: 'message',
      eventId: 'msg-1',
      recipientId: 'sender-9',
    };

    await processAutomationExecution(messageJob, {
      prisma,
      decryptor: makeDecryptor(),
      metaClient,
    });

    expect(metaClient.sendDm).toHaveBeenCalledWith('sender-9', 'Hi there!', 'plain-token');
    expect(metaClient.sendDmToComment).not.toHaveBeenCalled();
  });

  it('skips the DM and refunds the slot when the monthly plan limit is reached', async () => {
    const prisma = makePrisma({
      subscription: subscriptionWithDmLimit(100),
      usageTracking: {
        findUnique: vi.fn().mockResolvedValue({ count: 100 }),
        // reservation pushes the count over the cap (101 > 100)
        upsert: vi.fn().mockResolvedValue({ count: 101 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    });
    const metaClient = makeMetaClient();

    await processAutomationExecution(JOB, { prisma, decryptor: makeDecryptor(), metaClient });

    expect(metaClient.sendDmToComment).not.toHaveBeenCalled();
    // reserved a slot, then released it (refund)
    expect(prisma.usageTracking.upsert).toHaveBeenCalled();
    expect(prisma.usageTracking.updateMany).toHaveBeenCalled();
    expect(prisma.processedComment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ outcome: 'plan_limit_reached' }),
      }),
    );
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'BILLING' }) }),
    );
  });

  it('sends when the reservation lands exactly on the cap (Nth DM)', async () => {
    const prisma = makePrisma({
      subscription: subscriptionWithDmLimit(100),
      usageTracking: {
        findUnique: vi.fn().mockResolvedValue({ count: 99 }),
        upsert: vi.fn().mockResolvedValue({ count: 100 }), // exactly at the cap
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    });
    const metaClient = makeMetaClient();

    await processAutomationExecution(JOB, { prisma, decryptor: makeDecryptor(), metaClient });

    expect(metaClient.sendDmToComment).toHaveBeenCalled();
    expect(prisma.usageTracking.updateMany).not.toHaveBeenCalled(); // not refunded
  });

  it('refunds the reserved slot when the DM send fails', async () => {
    const prisma = makePrisma({
      subscription: subscriptionWithDmLimit(100),
      usageTracking: {
        findUnique: vi.fn().mockResolvedValue({ count: 5 }),
        upsert: vi.fn().mockResolvedValue({ count: 6 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    });
    const metaClient = makeMetaClient({
      sendDmToComment: vi.fn().mockRejectedValue(new InstagramApiError('timeout')),
    });

    await expect(
      processAutomationExecution(JOB, { prisma, decryptor: makeDecryptor(), metaClient }),
    ).rejects.toThrow('timeout');
    // reserved, then refunded because the send failed
    expect(prisma.usageTracking.updateMany).toHaveBeenCalled();
  });

  it('does not enforce the DM limit when the plan is unlimited', async () => {
    const prisma = makePrisma({
      subscription: subscriptionWithDmLimit(-1), // unlimited
      usageTracking: {
        findUnique: vi.fn().mockResolvedValue({ count: 999999 }),
        upsert: vi.fn().mockResolvedValue({ count: 1000000 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    });
    const metaClient = makeMetaClient();

    await processAutomationExecution(JOB, { prisma, decryptor: makeDecryptor(), metaClient });

    expect(metaClient.sendDmToComment).toHaveBeenCalled();
  });

  it('skips sending when the 24h rate limit is reached', async () => {
    const prisma = makePrisma({
      processedComment: {
        count: vi.fn().mockResolvedValue(1),
        upsert: vi.fn().mockResolvedValue({}),
      },
    });
    const metaClient = makeMetaClient();

    await processAutomationExecution(JOB, { prisma, decryptor: makeDecryptor(), metaClient });

    expect(metaClient.sendDmToComment).not.toHaveBeenCalled();
    expect(prisma.processedComment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ outcome: 'rate_limited' }) }),
    );
  });

  it('flags the account NEEDS_RECONNECT on an auth error and does not rethrow', async () => {
    const prisma = makePrisma();
    const metaClient = makeMetaClient({
      sendDmToComment: vi.fn().mockRejectedValue(new InstagramApiError('bad token', 190, 400)),
    });

    await expect(
      processAutomationExecution(JOB, { prisma, decryptor: makeDecryptor(), metaClient }),
    ).resolves.toBeUndefined();

    expect(prisma.instagramAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'NEEDS_RECONNECT' } }),
    );
  });

  it('rethrows transient (non-auth) errors so BullMQ retries', async () => {
    const prisma = makePrisma();
    const metaClient = makeMetaClient({
      sendDmToComment: vi.fn().mockRejectedValue(new InstagramApiError('timeout')),
    });

    await expect(
      processAutomationExecution(JOB, { prisma, decryptor: makeDecryptor(), metaClient }),
    ).rejects.toThrow('timeout');
    expect(prisma.instagramAccount.update).not.toHaveBeenCalled();
  });

  it('skips when the account is no longer CONNECTED', async () => {
    const prisma = makePrisma({
      automationRule: {
        findFirst: vi.fn().mockResolvedValue(
          ruleWithDm({
            instagramAccount: { id: 'acc-1', status: 'NEEDS_RECONNECT', accessTokenEncrypted: 'x' },
          }),
        ),
      },
    });
    const metaClient = makeMetaClient();

    await processAutomationExecution(JOB, { prisma, decryptor: makeDecryptor(), metaClient });

    expect(metaClient.sendDmToComment).not.toHaveBeenCalled();
  });

  it('opens a lead capture after the DM when collectEmail is on', async () => {
    const prisma = makePrisma({
      automationRule: {
        findFirst: vi.fn().mockResolvedValue(
          ruleWithDm({
            actions: [
              {
                type: 'SEND_DM',
                order: 0,
                config: JSON.stringify({ text: 'Drop your email 📧', collectEmail: true }),
              },
            ],
          }),
        ),
      },
    });
    const metaClient = makeMetaClient();

    await processAutomationExecution(JOB, { prisma, decryptor: makeDecryptor(), metaClient });

    expect(metaClient.sendDmToComment).toHaveBeenCalled();
    expect(prisma.pendingLeadCapture.upsert as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ contactScopedId: 'user-9', ruleId: 'rule-1' }),
      }),
    );
  });

  it('does not open a lead capture when collectEmail is off', async () => {
    const prisma = makePrisma();
    const metaClient = makeMetaClient();

    await processAutomationExecution(JOB, { prisma, decryptor: makeDecryptor(), metaClient });

    expect(prisma.pendingLeadCapture.upsert as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('skips messaging a contact who opted out (unsubscribed)', async () => {
    const prisma = makePrisma({
      contact: { findUnique: vi.fn().mockResolvedValue({ isSubscribed: false }) },
    });
    const metaClient = makeMetaClient();

    await processAutomationExecution(JOB, { prisma, decryptor: makeDecryptor(), metaClient });

    expect(metaClient.sendDmToComment).not.toHaveBeenCalled();
    expect(metaClient.replyToComment).not.toHaveBeenCalled();
    expect(prisma.processedComment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ outcome: 'unsubscribed' }) }),
    );
  });
});

describe('processSendLeadReply', () => {
  const LEAD_JOB: SendLeadReplyJob = {
    instagramAccountId: 'acc-1',
    organizationId: 'org-1',
    recipientId: 'sender-9',
    text: 'Thanks! Check your inbox 🎉',
  };

  it('sends the confirmation DM and counts it against the quota', async () => {
    const prisma = makePrisma();
    const metaClient = makeMetaClient();

    await processSendLeadReply(LEAD_JOB, { prisma, decryptor: makeDecryptor(), metaClient });

    expect(metaClient.sendDm).toHaveBeenCalledWith(
      'sender-9',
      'Thanks! Check your inbox 🎉',
      'plain-token',
    );
    expect(prisma.usageTracking.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { count: { increment: 1 } } }),
    );
  });

  it('skips when the account is not connected', async () => {
    const prisma = makePrisma({
      instagramAccount: {
        update: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: 'acc-1', status: 'NEEDS_RECONNECT' }),
      },
    });
    const metaClient = makeMetaClient();

    await processSendLeadReply(LEAD_JOB, { prisma, decryptor: makeDecryptor(), metaClient });

    expect(metaClient.sendDm).not.toHaveBeenCalled();
  });
});
