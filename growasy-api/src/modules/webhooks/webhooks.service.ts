import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { AppConfigService } from '../../config/app-config.service';
import { WebhookQueueService } from '../../queues/webhook-queue.service';
import {
  ProcessInstagramCommentJob,
  ProcessInstagramMessageJob,
} from '../../queues/queue-names.constant';
import { InstagramInboundMessage, InstagramWebhookBody } from './instagram-webhook.types';

/**
 * The webhook fast path. This service does NO database or Meta API work — it
 * validates the request and enqueues a self-contained job per comment onto the
 * `webhook-processing` queue. All business logic (dedup, account resolution,
 * rule matching, DM sending) lives in growasy-worker so the API returns 200 to
 * Meta well within its ~20s timeout regardless of downstream load.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly webhookQueue: WebhookQueueService,
  ) {}

  /** GET handshake — returns the challenge string when the verify token matches. */
  verifyChallenge(mode?: string, verifyToken?: string, challenge?: string): string | null {
    if (
      mode === 'subscribe' &&
      verifyToken &&
      verifyToken === this.config.meta.webhookVerifyToken
    ) {
      return challenge ?? '';
    }
    return null;
  }

  /**
   * Validates the X-Hub-Signature-256 HMAC against the raw request body.
   * Returns true when no app secret is configured (dev convenience) but logs a warning.
   */
  verifySignature(rawBody: Buffer | undefined, signatureHeader?: string): boolean {
    if (this.config.meta.skipWebhookSignature) {
      this.logger.warn('META_SKIP_WEBHOOK_SIGNATURE=true — skipping signature check (DEV ONLY)');
      return true;
    }
    const appSecret = this.config.meta.instagramAppSecret;
    if (!appSecret) {
      this.logger.warn('No app secret configured — skipping webhook signature verification');
      return true;
    }
    if (!rawBody || !signatureHeader?.startsWith('sha256=')) {
      return false;
    }
    const expected = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const a = Buffer.from(signatureHeader);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /**
   * DEV-only: logs the full parsed webhook body + a fields summary so you can
   * confirm which event arrived (comments vs messages vs message_edit/reaction).
   * Skipped in production — the payload carries PII (message text, user ids).
   */
  logIncoming(body: InstagramWebhookBody): void {
    if (this.config.isProduction) return;
    this.logger.debug({ body }, 'webhook payload received');
    const changeFields = body?.entry?.flatMap((e) => e.changes?.map((c) => c.field) ?? []) ?? [];
    // For entry[].messaging[], the meaningful key is `message` vs `message_edit`,
    // `reaction`, `read`, etc. — surface which so ignored events are obvious.
    const messagingKinds =
      body?.entry?.flatMap(
        (e) =>
          e.messaging?.flatMap((m) =>
            Object.keys(m).filter((k) => !['sender', 'recipient', 'timestamp'].includes(k)),
          ) ?? [],
      ) ?? [];
    this.logger.log({ changeFields, messagingKinds }, 'webhook fields received');
  }

  /** Flattens a webhook body into one self-contained job payload per comment. */
  extractComments(body: InstagramWebhookBody): ProcessInstagramCommentJob[] {
    if (body?.object !== 'instagram' || !Array.isArray(body.entry)) {
      return [];
    }
    const jobs: ProcessInstagramCommentJob[] = [];
    for (const entry of body.entry) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'comments' || !change.value?.id) continue;
        jobs.push({
          commentId: change.value.id,
          mediaId: change.value.media?.id ?? null,
          commentText: change.value.text ?? '',
          commenterId: change.value.from?.id ?? '',
          commenterUsername: change.value.from?.username ?? null,
          instagramBusinessAccountId: entry.id,
          rawEventTimestamp: entry.time ?? Date.now(),
        });
      }
    }
    return jobs;
  }

  /** Enqueues each comment onto `webhook-processing` for the worker to handle. */
  async enqueueComments(jobs: ProcessInstagramCommentJob[]): Promise<void> {
    for (const job of jobs) {
      await this.webhookQueue.enqueueComment(job);
      this.logger.debug(`Enqueued comment ${job.commentId} for processing`);
    }
  }

  /**
   * Flattens incoming messages (DMs + story replies) from entry[].messaging[].
   * Skips echoes (messages the business itself sent) and empty-text events
   * (reactions, media-only) — automations key off text.
   */
  extractMessages(body: InstagramWebhookBody): ProcessInstagramMessageJob[] {
    if (body?.object !== 'instagram' || !Array.isArray(body.entry)) {
      return [];
    }
    const jobs: ProcessInstagramMessageJob[] = [];
    for (const entry of body.entry) {
      // Shape A — Messenger-style entry[].messaging[].
      for (const event of entry.messaging ?? []) {
        // A message_edit event carries the edited copy of an existing DM — never
        // treat it as a new inbound message (would double-fire the automation).
        if (event.message_edit) continue;
        const job = this.toMessageJob(
          event.message,
          event.sender?.id,
          event.recipient?.id ?? entry.id,
          event.timestamp ?? entry.time,
        );
        if (job) jobs.push(job);
      }
      // Shape B — Instagram Login delivers DMs/story replies as a `messages`
      // change (entry[].changes[] with field: "messages"), not under messaging[].
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue;
        const v = change.value;
        // Same as Shape A — ignore edits to already-delivered messages.
        if (v?.message_edit) continue;
        const job = this.toMessageJob(
          v.message,
          v.sender?.id,
          v.recipient?.id ?? entry.id,
          typeof v.timestamp === 'string' ? Number(v.timestamp) : (v.timestamp ?? entry.time),
        );
        if (job) jobs.push(job);
      }
    }
    return jobs;
  }

  /** Normalizes a raw inbound message into a job, or null if it's not actionable. */
  private toMessageJob(
    message: InstagramInboundMessage | undefined,
    senderId: string | undefined,
    businessAccountId: string,
    timestamp: number | undefined,
  ): ProcessInstagramMessageJob | null {
    if (!message?.mid || message.is_echo) return null;

    // Someone tagged the business in their own story. This is the reshare signal
    // worth rewarding, and it arrives with no text — so the "must have text"
    // rule below would silently drop every one of them.
    const isStoryMention = (message.attachments ?? []).some((a) => a.type === 'story_mention');

    if (!message.text && !isStoryMention) return null;

    return {
      messageId: message.mid,
      text: message.text ?? '',
      senderId: senderId ?? '',
      isStoryReply: Boolean(message.reply_to?.story),
      isStoryMention,
      instagramBusinessAccountId: businessAccountId,
      rawEventTimestamp: timestamp ?? Date.now(),
    };
  }

  /** Enqueues each message onto `webhook-processing` for the worker to handle. */
  async enqueueMessages(jobs: ProcessInstagramMessageJob[]): Promise<void> {
    for (const job of jobs) {
      await this.webhookQueue.enqueueMessage(job);
      this.logger.debug(`Enqueued message ${job.messageId} for processing`);
    }
  }
}
