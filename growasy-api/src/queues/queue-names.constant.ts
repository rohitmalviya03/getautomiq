/**
 * Shared BullMQ queue names. growasy-worker registers processors for the same
 * names against the same Redis instance — this is the contract between the two
 * services. Keep in sync with growasy-worker/src/queues/queue-names.constant.ts.
 */
export const QUEUE_NAMES = {
  MAIL: 'mail',
  INSTAGRAM_SYNC: 'instagram-sync',
  AUTOMATION_EXECUTION: 'automation-execution',
  WEBHOOK_PROCESSING: 'webhook-processing',
} as const;

export const MAIL_JOB_NAMES = {
  SEND_VERIFICATION_EMAIL: 'send-verification-email',
  SEND_PASSWORD_RESET_EMAIL: 'send-password-reset-email',
  SEND_WELCOME_EMAIL: 'send-welcome-email',
  SEND_PLAN_EXPIRING_EMAIL: 'send-plan-expiring-email',
  SEND_PLAN_EXPIRED_EMAIL: 'send-plan-expired-email',
  SEND_ADMIN_MESSAGE_EMAIL: 'send-admin-message-email',
} as const;

/**
 * A message an admin typed by hand in the console and sent to a customer.
 * `body` is plain text, never HTML — the template escapes it, so nothing an
 * admin pastes can inject markup into the customer's inbox.
 */
export interface SendAdminMessageEmailJob {
  toEmail: string;
  firstName: string;
  subject: string;
  body: string;
}

export interface SendVerificationEmailJob {
  toEmail: string;
  firstName: string;
  verificationUrl: string;
}

export interface SendPasswordResetEmailJob {
  toEmail: string;
  firstName: string;
  resetUrl: string;
}

export interface SendWelcomeEmailJob {
  toEmail: string;
  firstName: string;
}

/** Heads-up a few days before a non-renewing plan lapses. */
export interface SendPlanExpiringEmailJob {
  toEmail: string;
  firstName: string;
  planName: string;
  /** End date, pre-formatted by the producer so both sides agree on the wording. */
  endsAt: string;
  daysLeft: number;
}

/** Sent once, on the day the plan actually lapses to Free. */
export interface SendPlanExpiredEmailJob {
  toEmail: string;
  firstName: string;
  planName: string;
}

export const WEBHOOK_JOB_NAMES = {
  PROCESS_INSTAGRAM_COMMENT: 'process-instagram-comment',
  PROCESS_INSTAGRAM_MESSAGE: 'process-instagram-message',
} as const;

/**
 * Self-contained comment payload enqueued onto `webhook-processing` by the API's
 * webhook receiver. The API does NO DB/Meta work in the request path — it just
 * validates the signature and hands each comment to growasy-worker, which owns
 * dedup, rule matching, and DM sending. Keep in sync with
 * growasy-worker/src/queues/queue-names.constant.ts and API_CONTRACT.md.
 */
export interface ProcessInstagramCommentJob {
  commentId: string;
  mediaId: string | null;
  commentText: string;
  commenterId: string;
  commenterUsername: string | null;
  instagramBusinessAccountId: string;
  rawEventTimestamp: number;
}

/**
 * Self-contained incoming-message payload (DM or story reply) enqueued onto
 * `webhook-processing`. Story replies and direct DMs both arrive via the Instagram
 * `messages` webhook field (entry[].messaging[]) — a different shape from comments.
 */
export interface ProcessInstagramMessageJob {
  messageId: string;
  text: string;
  senderId: string; // the person messaging the business (IGSID)
  isStoryReply: boolean;
  /**
   * The sender tagged the business in THEIR story (a reshare), as opposed to
   * replying to one of ours. Carries no text, so keyword matching doesn't apply.
   */
  isStoryMention?: boolean;
  instagramBusinessAccountId: string;
  rawEventTimestamp: number;
}
