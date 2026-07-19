import { describe, expect, it } from 'vitest';

import { validateEnv } from './env';

// DATABASE_URL + ENCRYPTION_KEY are required (no sensible default), so every
// valid config must supply them.
const REQUIRED = {
  DATABASE_URL: 'mysql://root:pw@localhost:3306/growasy',
  ENCRYPTION_KEY: 'a'.repeat(64),
};

describe('validateEnv', () => {
  it('applies defaults when optional vars are absent', () => {
    const env = validateEnv({ ...REQUIRED });

    expect(env.NODE_ENV).toBe('development');
    expect(env.REDIS_HOST).toBe('localhost');
    expect(env.REDIS_PORT).toBe(6379);
    expect(env.SMTP_PORT).toBe(1025);
    expect(env.HEALTH_PORT).toBe(4100);
    expect(env.MAIL_FROM).toBe('Growasy <no-reply@growasy.app>');
    expect(env.META_GRAPH_API_VERSION).toBe('v20.0');
    expect(env.INSTAGRAM_GRAPH_BASE).toBe('https://graph.instagram.com');
  });

  it('coerces numeric string env vars to numbers', () => {
    const env = validateEnv({
      ...REQUIRED,
      REDIS_PORT: '6380',
      SMTP_PORT: '2525',
      HEALTH_PORT: '9000',
    });

    expect(env.REDIS_PORT).toBe(6380);
    expect(env.SMTP_PORT).toBe(2525);
    expect(env.HEALTH_PORT).toBe(9000);
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => validateEnv({ ENCRYPTION_KEY: 'a'.repeat(64) })).toThrow(
      /Environment validation failed/,
    );
  });

  it('rejects a non-hex or wrong-length ENCRYPTION_KEY', () => {
    expect(() => validateEnv({ ...REQUIRED, ENCRYPTION_KEY: 'too-short' })).toThrow(
      /ENCRYPTION_KEY/,
    );
  });

  it('rejects an invalid NODE_ENV value', () => {
    expect(() => validateEnv({ ...REQUIRED, NODE_ENV: 'staging' })).toThrow(
      /Environment validation failed/,
    );
  });

  it('accepts a fully populated production-like config', () => {
    const env = validateEnv({
      ...REQUIRED,
      NODE_ENV: 'production',
      REDIS_HOST: 'redis',
      REDIS_PORT: '6379',
      REDIS_PASSWORD: 'secret',
      SMTP_HOST: 'smtp.sendgrid.net',
      SMTP_PORT: '587',
      SMTP_USER: 'apikey',
      SMTP_PASSWORD: 'sg-secret',
      MAIL_FROM: 'Growasy <no-reply@growasy.app>',
      WEB_APP_URL: 'https://app.growasy.app',
      HEALTH_PORT: '4100',
    });

    expect(env.NODE_ENV).toBe('production');
    expect(env.REDIS_PASSWORD).toBe('secret');
    expect(env.SMTP_HOST).toBe('smtp.sendgrid.net');
  });
});
