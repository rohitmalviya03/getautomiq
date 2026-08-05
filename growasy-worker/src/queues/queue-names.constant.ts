/**
 * Shared BullMQ queue names. growasy-api produces jobs onto the same names
 * against the same Redis instance — this is the contract between the two
 * services. Keep in sync with growasy-api/src/queues/queue-names.constant.ts
 * and with API_CONTRACT.md at the repo root of the polyrepo.
 */
export const QUEUE_NAMES = {
  MAIL: 'mail',
  INSTAGRAM_SYNC: 'instagram-sync',
  AUTOMATION_EXECUTION: 'automation-execution',
  WEBHOOK_PROCESSING: 'webhook-processing',
  WORKFLOW_EXECUTION: 'workflow-execution',
} as const;

export const WORKFLOW_JOB_NAMES = {
  /** Advance a WorkflowRun from its current node until it completes or pauses. */
  RUN_WORKFLOW: 'run-workflow',
} as const;

/** One job per step-batch of a workflow run. `resumeText` carries a contact reply
 *  that resumes a WAITING (wait-for-reply/collect) run; `resume` is a Delay timer
 *  firing (no reply). Either flag lets a WAITING run advance. */
export interface RunWorkflowJob {
  runId: string;
  resumeText?: string;
  resume?: boolean;
}

export const MAIL_JOB_NAMES = {
  SEND_VERIFICATION_EMAIL: 'send-verification-email',
  SEND_PASSWORD_RESET_EMAIL: 'send-password-reset-email',
  SEND_WELCOME_EMAIL: 'send-welcome-email',
  SEND_PLAN_EXPIRING_EMAIL: 'send-plan-expiring-email',
  SEND_PLAN_EXPIRED_EMAIL: 'send-plan-expired-email',
} as const;

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

// ---------------------------------------------------------------------------
// Instagram comment → DM automation (two-stage pipeline)
//
//   growasy-api  --(webhook-processing)-->  worker stage 1 (match)
//   worker stage 1  --(automation-execution)-->  worker stage 2 (send DM)
//
// Keep these in sync with growasy-api/src/queues/queue-names.constant.ts and
// API_CONTRACT.md.
// ---------------------------------------------------------------------------

export const WEBHOOK_JOB_NAMES = {
  PROCESS_INSTAGRAM_COMMENT: 'process-instagram-comment',
  PROCESS_INSTAGRAM_MESSAGE: 'process-instagram-message',
} as const;

/** Enqueued by growasy-api's webhook receiver — one job per received comment. */
export interface ProcessInstagramCommentJob {
  commentId: string;
  mediaId: string | null;
  commentText: string;
  commenterId: string;
  commenterUsername: string | null;
  instagramBusinessAccountId: string;
  rawEventTimestamp: number;
}

/** Enqueued per incoming DM / story reply (Instagram `messages` field). */
export interface ProcessInstagramMessageJob {
  messageId: string;
  text: string;
  senderId: string;
  isStoryReply: boolean;
  instagramBusinessAccountId: string;
  rawEventTimestamp: number;
}

export const AUTOMATION_JOB_NAMES = {
  EXECUTE_AUTOMATION: 'execute-automation',
  /** Lead-capture confirmation/retry DM — enqueued by the webhook stage after it
   * intercepts a contact's email reply. Sends a single DM; needs no rule/match. */
  SEND_LEAD_REPLY: 'send-lead-reply',
} as const;

/**
 * Enqueued by the webhook-processing consumer when a rule matches. `source`
 * decides how the DM is sent: `comment` uses `recipient.comment_id` (eventId is
 * the comment id), `message` uses `recipient.id` (recipientId is the sender's
 * IGSID). `eventId` is also the dedup key in `processed_comments`.
 */
export interface ExecuteAutomationJob {
  ruleId: string;
  source: 'comment' | 'message';
  eventId: string;
  commenterId: string;
  recipientId: string;
  mediaId: string | null;
  instagramAccountId: string;
}

/**
 * Enqueued by the webhook-processing consumer when it intercepts a lead-capture
 * email reply (valid or invalid). Sends one plain DM back to the contact — no
 * rule matching, no dedup ledger. `recipientId` is the contact's IGSID.
 */
export interface SendLeadReplyJob {
  instagramAccountId: string;
  organizationId: string;
  recipientId: string;
  text: string;
}
