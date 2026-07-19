import { createHmac } from 'crypto';
import { WebhooksService } from './webhooks.service';
import { AppConfigService } from '../../config/app-config.service';
import { WebhookQueueService } from '../../queues/webhook-queue.service';
import { InstagramWebhookBody } from './instagram-webhook.types';

const APP_SECRET = 'test-app-secret';
const VERIFY_TOKEN = 'verify-me';

function makeService(overrides?: { queue?: Partial<WebhookQueueService> }) {
  const config = {
    meta: { instagramAppSecret: APP_SECRET, webhookVerifyToken: VERIFY_TOKEN },
  } as unknown as AppConfigService;
  const queue = {
    enqueueComment: jest.fn().mockResolvedValue(undefined),
    ...overrides?.queue,
  } as unknown as WebhookQueueService;
  return { service: new WebhooksService(config, queue), queue };
}

describe('WebhooksService', () => {
  describe('verifyChallenge', () => {
    it('returns the challenge when mode + token match', () => {
      const { service } = makeService();
      expect(service.verifyChallenge('subscribe', VERIFY_TOKEN, '12345')).toBe('12345');
    });
    it('returns null on a bad token', () => {
      const { service } = makeService();
      expect(service.verifyChallenge('subscribe', 'wrong', '12345')).toBeNull();
    });
    it('returns null on a non-subscribe mode', () => {
      const { service } = makeService();
      expect(service.verifyChallenge('unsubscribe', VERIFY_TOKEN, '12345')).toBeNull();
    });
  });

  describe('verifySignature', () => {
    it('accepts a correct sha256 HMAC of the raw body', () => {
      const { service } = makeService();
      const raw = Buffer.from(JSON.stringify({ object: 'instagram' }));
      const sig = 'sha256=' + createHmac('sha256', APP_SECRET).update(raw).digest('hex');
      expect(service.verifySignature(raw, sig)).toBe(true);
    });
    it('rejects a tampered body', () => {
      const { service } = makeService();
      const raw = Buffer.from('{"object":"instagram"}');
      const sig =
        'sha256=' + createHmac('sha256', APP_SECRET).update(Buffer.from('other')).digest('hex');
      expect(service.verifySignature(raw, sig)).toBe(false);
    });
    it('rejects a missing/malformed header', () => {
      const { service } = makeService();
      expect(service.verifySignature(Buffer.from('x'), undefined)).toBe(false);
      expect(service.verifySignature(Buffer.from('x'), 'nothex')).toBe(false);
    });
  });

  describe('extractComments', () => {
    it('flattens comment changes into self-contained job payloads', () => {
      const { service } = makeService();
      const body: InstagramWebhookBody = {
        object: 'instagram',
        entry: [
          {
            id: 'ig-acct-1',
            time: 1700000000,
            changes: [
              {
                field: 'comments',
                value: {
                  id: 'comment-1',
                  text: 'price?',
                  from: { id: 'user-9', username: 'buyer' },
                  media: { id: 'media-1' },
                },
              },
              { field: 'mentions', value: { id: 'x' } },
            ],
          },
        ],
      };
      const jobs = service.extractComments(body);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toEqual({
        commentId: 'comment-1',
        mediaId: 'media-1',
        commentText: 'price?',
        commenterId: 'user-9',
        commenterUsername: 'buyer',
        instagramBusinessAccountId: 'ig-acct-1',
        rawEventTimestamp: 1700000000,
      });
    });

    it('returns [] for a non-instagram object', () => {
      const { service } = makeService();
      expect(service.extractComments({ object: 'page', entry: [] })).toEqual([]);
    });
  });

  describe('extractMessages', () => {
    it('extracts incoming messages and flags story replies, skipping echoes', () => {
      const { service } = makeService();
      const jobs = service.extractMessages({
        object: 'instagram',
        entry: [
          {
            id: 'ig-acct-1',
            time: 1700000000,
            messaging: [
              {
                sender: { id: 'user-9' },
                recipient: { id: 'ig-acct-1' },
                timestamp: 1700000001,
                message: {
                  mid: 'm-1',
                  text: 'price?',
                  reply_to: { story: { id: 'story-1' } },
                },
              },
              // echo (business's own outgoing message) — ignored
              { sender: { id: 'ig-acct-1' }, message: { mid: 'm-2', text: 'hi', is_echo: true } },
              // no text (reaction/media only) — ignored
              { sender: { id: 'user-9' }, message: { mid: 'm-3' } },
            ],
          },
        ],
      });
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        messageId: 'm-1',
        text: 'price?',
        senderId: 'user-9',
        isStoryReply: true,
        instagramBusinessAccountId: 'ig-acct-1',
      });
    });

    it('extracts messages delivered as a `messages` change (Instagram Login shape)', () => {
      const { service } = makeService();
      const jobs = service.extractMessages({
        object: 'instagram',
        entry: [
          {
            id: 'entry-0',
            time: 1700000000,
            changes: [
              {
                field: 'messages',
                value: {
                  sender: { id: 'user-42' },
                  recipient: { id: 'ig-biz-1' },
                  timestamp: '1700000123',
                  message: { mid: 'msg-9', text: 'link please' },
                },
              },
            ],
          },
        ],
      });
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        messageId: 'msg-9',
        text: 'link please',
        senderId: 'user-42',
        instagramBusinessAccountId: 'ig-biz-1', // recipient (business), not entry.id
      });
    });
  });

  describe('enqueueComments', () => {
    it('enqueues one job per comment', async () => {
      const { service, queue } = makeService();
      await service.enqueueComments([
        {
          commentId: 'c-1',
          mediaId: null,
          commentText: 'price',
          commenterId: 'u-1',
          commenterUsername: null,
          instagramBusinessAccountId: 'ig-1',
          rawEventTimestamp: 1,
        },
      ]);
      expect(queue.enqueueComment).toHaveBeenCalledWith(
        expect.objectContaining({ commentId: 'c-1', commenterId: 'u-1' }),
      );
    });
  });
});
