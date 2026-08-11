import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { sha256 } from '../../common/utils/hash.util';

/** Prefix on every issued key, so a leaked one is recognisable in logs and grep. */
const KEY_PREFIX = 'amq_live_';

export interface IssuedApiKey {
  id: string;
  name: string;
  /** The full key. Returned exactly once, at creation — we only store its hash. */
  key: string;
  keyPrefix: string;
  createdAt: Date;
}

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string) {
    const keys = await this.prisma.apiKey.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });
    return { items: keys };
  }

  async create(organizationId: string, userId: string, name: string): Promise<IssuedApiKey> {
    // 32 random bytes: the key is a bearer credential with no rate-limited
    // guessing story behind it, so it has to be unguessable on its own.
    const key = `${KEY_PREFIX}${randomBytes(32).toString('base64url')}`;

    const row = await this.prisma.apiKey.create({
      data: {
        organizationId,
        name: name.trim(),
        keyHash: sha256(key),
        keyPrefix: key.slice(0, 16),
        createdByUserId: userId,
      },
      select: { id: true, name: true, keyPrefix: true, createdAt: true },
    });

    return { ...row, key };
  }

  async revoke(organizationId: string, id: string) {
    const existing = await this.prisma.apiKey.findFirst({
      where: { id, organizationId },
      select: { id: true, revokedAt: true },
    });
    if (!existing) throw new NotFoundException('API key not found');
    if (existing.revokedAt) return { revoked: true };

    await this.prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    return { revoked: true };
  }

  /**
   * Resolves a presented key to its organization, or null if it is unknown or
   * revoked. Lookup is by hash, so the plaintext never has to be stored or
   * compared column-by-column.
   */
  async resolve(presentedKey: string): Promise<{ organizationId: string; apiKeyId: string } | null> {
    if (!presentedKey.startsWith(KEY_PREFIX)) return null;

    const row = await this.prisma.apiKey.findUnique({
      where: { keyHash: sha256(presentedKey) },
      select: { id: true, organizationId: true, revokedAt: true },
    });
    if (!row || row.revokedAt) return null;

    // Best-effort: a failed touch must not fail the caller's request.
    void this.prisma.apiKey
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    return { organizationId: row.organizationId, apiKeyId: row.id };
  }
}
