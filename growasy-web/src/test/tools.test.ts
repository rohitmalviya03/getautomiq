import { describe, expect, it } from 'vitest';
import { generateHashtags, parseKeywords } from '@/lib/tools/hashtags';
import { generateCaptions } from '@/lib/tools/captions';
import { computeEngagement } from '@/lib/tools/engagement';

describe('parseKeywords', () => {
  it('cleans, dedups and drops tiny tokens', () => {
    expect(parseKeywords('Coffee, #coffee morning a to')).toEqual(['coffee', 'morning', 'to']);
  });
  it('returns empty for junk input', () => {
    expect(parseKeywords('# ! .')).toEqual([]);
  });
});

describe('generateHashtags', () => {
  it('returns grouped, hash-prefixed, unique tags', () => {
    const result = generateHashtags('coffee cafe', 21);
    expect(result.groups).toHaveLength(3);
    expect(result.all.length).toBeGreaterThan(0);
    expect(result.all.every((t) => t.startsWith('#'))).toBe(true);
    // no duplicates across the flattened list
    expect(new Set(result.all).size).toBe(result.all.length);
  });
  it('returns nothing for empty input', () => {
    expect(generateHashtags('').all).toEqual([]);
  });
});

describe('generateCaptions', () => {
  it('produces up to 3 captions and honors the CTA/hashtag toggles', () => {
    const withExtras = generateCaptions({
      topic: 'coffee',
      tone: 'casual',
      emojis: true,
      cta: true,
      hashtags: true,
    });
    expect(withExtras.length).toBeGreaterThan(0);
    expect(withExtras.length).toBeLessThanOrEqual(3);
    expect(withExtras[0]).toContain('#coffee');

    const bare = generateCaptions({
      topic: 'coffee',
      tone: 'casual',
      emojis: false,
      cta: false,
      hashtags: false,
    });
    expect(bare[0]).not.toContain('#');
  });
  it('returns empty for a blank topic', () => {
    expect(generateCaptions({ topic: '  ', tone: 'funny', emojis: true, cta: true, hashtags: true })).toEqual([]);
  });
});

describe('computeEngagement', () => {
  it('computes the rate and rating band', () => {
    const r = computeEngagement({ followers: 10000, avgLikes: 350, avgComments: 20 });
    expect(r?.rate).toBe(3.7);
    expect(r?.rating).toBe('good');
    expect(r?.interactionsPerPost).toBe(370);
  });
  it('bands low / average / excellent correctly', () => {
    expect(computeEngagement({ followers: 1000, avgLikes: 5, avgComments: 0 })?.rating).toBe('low');
    expect(computeEngagement({ followers: 1000, avgLikes: 20, avgComments: 0 })?.rating).toBe('average');
    expect(computeEngagement({ followers: 1000, avgLikes: 80, avgComments: 5 })?.rating).toBe('excellent');
  });
  it('returns null when followers is zero or invalid', () => {
    expect(computeEngagement({ followers: 0, avgLikes: 10, avgComments: 1 })).toBeNull();
    expect(computeEngagement({ followers: NaN, avgLikes: 10, avgComments: 1 })).toBeNull();
  });
});
