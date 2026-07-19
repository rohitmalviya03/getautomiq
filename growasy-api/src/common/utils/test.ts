/**
 * Temporary debug script: fetch an Instagram account by username and print its
 * DECRYPTED access token. Standalone (no Nest DI) — run with ts-node:
 *
 *   npx ts-node src/common/utils/test.ts               # defaults to "getautomiq"
 *   npx ts-node src/common/utils/test.ts me.unfiltered_._
 *
 * Reads DATABASE_URL + ENCRYPTION_KEY from .env. Do NOT ship this file.
 */
import 'dotenv/config';
import { createDecipheriv } from 'crypto';
import { PrismaClient } from '@prisma/client';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/** Mirrors TokenEncryptionService: base64url(iv).base64url(authTag).base64url(ciphertext). */
function decrypt(payload: string, hexKey: string): string {
  const key = Buffer.from(hexKey, 'hex');
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid encrypted payload format');
  }
  const iv = Buffer.from(ivB64, 'base64url');
  const authTag = Buffer.from(tagB64, 'base64url');
  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Invalid encrypted payload format');
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

async function main() {
  const username = process.argv[2] ?? 'getautomiq';
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY is not set (check .env)');
  }

  const prisma = new PrismaClient();
  try {
    const account = await prisma.instagramAccount.findFirst({
      where: { username },
    });
    if (!account) {
      console.error(`No Instagram account found for username "${username}"`);
      return;
    }
    console.log(`@${account.username} (${account.status})`);
    console.log('token:', decrypt(account.accessTokenEncrypted, encryptionKey));
    console.log('IG_USER_ID:', account.instagramBusinessId);

  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
