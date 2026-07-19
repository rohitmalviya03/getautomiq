import { randomBytes } from 'crypto';
import { TokenEncryptionService } from './token-encryption.service';
import { AppConfigService } from '../../config/app-config.service';

describe('TokenEncryptionService', () => {
  let service: TokenEncryptionService;

  beforeEach(() => {
    const config = { encryptionKey: randomBytes(32).toString('hex') } as AppConfigService;
    service = new TokenEncryptionService(config);
  });

  it('round-trips a value: decrypt(encrypt(x)) === x', () => {
    const secret = 'EAABsbCS1234LongLivedPageToken|abc';
    expect(service.decrypt(service.encrypt(secret))).toBe(secret);
  });

  it('produces a different ciphertext each call (random IV)', () => {
    const secret = 'same-input';
    expect(service.encrypt(secret)).not.toBe(service.encrypt(secret));
  });

  it('handles unicode payloads', () => {
    const secret = 'токен-🔐-टोकन';
    expect(service.decrypt(service.encrypt(secret))).toBe(secret);
  });

  it('rejects a tampered ciphertext (GCM auth tag)', () => {
    const encrypted = service.encrypt('secret');
    const parts = encrypted.split('.');
    // flip a byte in the ciphertext segment
    const corrupted = Buffer.from(parts[2], 'base64url');
    corrupted[0] = corrupted[0] ^ 0xff;
    parts[2] = corrupted.toString('base64url');
    expect(() => service.decrypt(parts.join('.'))).toThrow();
  });

  it('rejects malformed payloads', () => {
    expect(() => service.decrypt('not-a-valid-payload')).toThrow(
      'Invalid encrypted payload format',
    );
    expect(() => service.decrypt('a.b')).toThrow('Invalid encrypted payload format');
  });

  it('cannot decrypt with a different key', () => {
    const other = new TokenEncryptionService({
      encryptionKey: randomBytes(32).toString('hex'),
    } as AppConfigService);
    const encrypted = service.encrypt('secret');
    expect(() => other.decrypt(encrypted)).toThrow();
  });
});
