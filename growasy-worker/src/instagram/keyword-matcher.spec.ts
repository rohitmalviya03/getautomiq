import { describe, expect, it } from 'vitest';

import { matchesKeywords } from './keyword-matcher';

describe('matchesKeywords', () => {
  it('CONTAINS matches a keyword anywhere, case-insensitively', () => {
    expect(matchesKeywords('What is the PRICE?', 'CONTAINS', ['price'])).toBe(true);
    expect(matchesKeywords('just browsing', 'CONTAINS', ['price'])).toBe(false);
  });

  it('EXACT matches only the whole trimmed comment', () => {
    expect(matchesKeywords('  Link  ', 'EXACT', ['link'])).toBe(true);
    expect(matchesKeywords('send link', 'EXACT', ['link'])).toBe(false);
  });

  it('STARTS_WITH matches a leading keyword', () => {
    expect(matchesKeywords('info please', 'STARTS_WITH', ['info'])).toBe(true);
    expect(matchesKeywords('need info', 'STARTS_WITH', ['info'])).toBe(false);
  });

  it('ANY matches any non-empty comment and needs no keywords', () => {
    expect(matchesKeywords('anything', 'ANY', [])).toBe(true);
    expect(matchesKeywords('   ', 'ANY', [])).toBe(false);
  });

  it('REGEX treats each keyword as a pattern and ignores invalid ones', () => {
    expect(matchesKeywords('order #42', 'REGEX', ['#\\d+'])).toBe(true);
    expect(matchesKeywords('order', 'REGEX', ['[invalid'])).toBe(false);
  });

  it('returns false for non-ANY match types with no keywords', () => {
    expect(matchesKeywords('price', 'CONTAINS', [])).toBe(false);
  });
});
