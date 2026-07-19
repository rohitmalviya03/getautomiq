import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';

export async function hashPassword(plain: string, saltRounds: number): Promise<string> {
  return bcrypt.hash(plain, saltRounds);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Generates a URL-safe opaque token for emails/refresh tokens; returns both the
 * raw value (sent to the user, never persisted) and its SHA-256 hash (persisted). */
export function generateOpaqueToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: sha256(raw) };
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
