import { createHash } from 'node:crypto';

/** Which pipeline an id came from — namespaces the key so the two never collide. */
export type DedupKind = 'cmt' | 'msg';

/**
 * Idempotency key for the ProcessedComment ledger. A message `mid` can be 200+
 * chars — longer than any column MySQL 5.6 (utf8mb4) can uniquely index — so we
 * dedup on a fixed-length sha256, not the raw value. The `kind` prefix is folded
 * into the *hash input* (not the output, which stays 64 hex chars) so a comment
 * id and a message mid can never produce the same key. Both pipeline stages must
 * derive the key the same way for a given event, hence this single shared helper.
 */
export function dedupKeyFor(kind: DedupKind, id: string): string {
  return createHash('sha256').update(`${kind}:${id}`).digest('hex');
}
