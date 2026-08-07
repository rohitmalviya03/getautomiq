import { describe, expect, it } from 'vitest';
import { InstagramApiError } from './meta-graph.client';

/**
 * Meta's throttling codes have to be told apart from ordinary failures: a dead
 * token must stop retrying, a throttle must keep the job and wait. Getting this
 * classification wrong either hammers the API or silently drops DMs.
 */
describe('InstagramApiError', () => {
  it('treats code 190 and HTTP 401 as auth errors, not rate limits', () => {
    const byCode = new InstagramApiError('token dead', 190, 400);
    const byStatus = new InstagramApiError('unauthorized', undefined, 401);

    expect(byCode.isAuthError).toBe(true);
    expect(byCode.isRateLimited).toBe(false);
    expect(byStatus.isAuthError).toBe(true);
  });

  it.each([4, 17, 32, 613, 80007])('flags Meta throttling code %i', (code) => {
    const error = new InstagramApiError('slow down', code, 400);
    expect(error.isRateLimited).toBe(true);
    expect(error.isAuthError).toBe(false);
  });

  it('flags HTTP 429 even without a graph code', () => {
    expect(new InstagramApiError('too many requests', undefined, 429).isRateLimited).toBe(true);
  });

  it('leaves ordinary errors alone', () => {
    const error = new InstagramApiError('user unavailable', 551, 400);
    expect(error.isRateLimited).toBe(false);
    expect(error.isAuthError).toBe(false);
  });

  it('uses Meta’s Retry-After hint when present', () => {
    expect(new InstagramApiError('slow down', 4, 429, 30_000).backoffMs).toBe(30_000);
  });

  it('falls back to a default when Meta gives no hint', () => {
    expect(new InstagramApiError('slow down', 4, 429).backoffMs).toBe(60_000);
  });

  it('caps an absurd Retry-After so a worker never parks for hours', () => {
    expect(new InstagramApiError('slow down', 4, 429, 6 * 60 * 60 * 1000).backoffMs).toBe(
      15 * 60_000,
    );
  });
});
