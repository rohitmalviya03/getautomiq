import { Prisma, type PrismaClient } from '@prisma/client';

export interface UpsertContactInput {
  organizationId: string;
  instagramAccountId: string;
  instagramScopedId: string; // the commenter's IG-scoped id
  username: string | null;
}

/**
 * Records/refreshes a contact (lead) whenever an automation engages someone.
 * Idempotent on (instagramAccountId, instagramScopedId) — every commenter the
 * business interacts with becomes a CRM contact. Tolerates the create/create
 * race between concurrent workers by falling back to a plain update.
 */
export async function upsertContact(
  prisma: PrismaClient,
  input: UpsertContactInput,
): Promise<void> {
  const where = {
    instagramAccountId_instagramScopedId: {
      instagramAccountId: input.instagramAccountId,
      instagramScopedId: input.instagramScopedId,
    },
  };
  try {
    await prisma.contact.upsert({
      where,
      update: { username: input.username ?? undefined, lastInteractionAt: new Date() },
      create: {
        organizationId: input.organizationId,
        instagramAccountId: input.instagramAccountId,
        instagramScopedId: input.instagramScopedId,
        username: input.username,
        lastInteractionAt: new Date(),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      await prisma.contact.update({
        where,
        data: { username: input.username ?? undefined, lastInteractionAt: new Date() },
      });
      return;
    }
    throw error;
  }
}
