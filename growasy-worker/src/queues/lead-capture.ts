import type { PrismaClient } from '@prisma/client';

/** How long after the DM is sent we keep listening for the contact's email. */
export const LEAD_CAPTURE_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Give up (mark EXPIRED) after this many non-email replies. */
export const MAX_CAPTURE_ATTEMPTS = 3;

export const CAPTURE_STATUS = {
  AWAITING: 'AWAITING',
  COMPLETED: 'COMPLETED',
  EXPIRED: 'EXPIRED',
} as const;

// Deliberately permissive: contacts type "my email is a@b.com" or "A@B.COM ✌️".
// We extract the first email-looking token rather than validate the whole reply.
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

/** Pulls the first email out of a free-text DM reply, lowercased; null if none. */
export function extractEmail(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(EMAIL_RE);
  return match ? match[0].toLowerCase() : null;
}

/**
 * Records (or refreshes) the "awaiting email" state for a contact after an
 * automation with lead capture sends its DM. Idempotent on
 * (instagramAccountId, contactScopedId): a fresh trigger resets the window and
 * re-opens the capture (status back to AWAITING, attempts cleared).
 */
export async function openLeadCapture(
  prisma: PrismaClient,
  input: {
    instagramAccountId: string;
    organizationId: string;
    contactScopedId: string;
    ruleId: string;
  },
): Promise<void> {
  const expiresAt = new Date(Date.now() + LEAD_CAPTURE_WINDOW_MS);
  await prisma.pendingLeadCapture.upsert({
    where: {
      instagramAccountId_contactScopedId: {
        instagramAccountId: input.instagramAccountId,
        contactScopedId: input.contactScopedId,
      },
    },
    update: {
      ruleId: input.ruleId,
      status: CAPTURE_STATUS.AWAITING,
      attempts: 0,
      capturedEmail: null,
      expiresAt,
    },
    create: {
      instagramAccountId: input.instagramAccountId,
      organizationId: input.organizationId,
      contactScopedId: input.contactScopedId,
      ruleId: input.ruleId,
      status: CAPTURE_STATUS.AWAITING,
      expiresAt,
    },
  });
}

export type PendingCapture = NonNullable<
  Awaited<ReturnType<PrismaClient['pendingLeadCapture']['findUnique']>>
>;

/**
 * Returns the contact's capture row only if it's still actively awaiting an email
 * (AWAITING and inside the window). Anything else → null (the message flows on to
 * normal keyword matching).
 */
export async function findActiveCapture(
  prisma: PrismaClient,
  instagramAccountId: string,
  contactScopedId: string,
): Promise<PendingCapture | null> {
  const capture = await prisma.pendingLeadCapture.findUnique({
    where: { instagramAccountId_contactScopedId: { instagramAccountId, contactScopedId } },
  });
  if (!capture) return null;
  if (capture.status !== CAPTURE_STATUS.AWAITING) return null;
  if (capture.expiresAt.getTime() <= Date.now()) return null;
  return capture;
}
