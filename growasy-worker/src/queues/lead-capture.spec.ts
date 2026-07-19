import { describe, expect, it } from 'vitest';

import { extractEmail } from './lead-capture';

describe('extractEmail', () => {
  it('extracts a bare email and lowercases it', () => {
    expect(extractEmail('Buyer@Example.COM')).toBe('buyer@example.com');
  });

  it('pulls the email out of a sentence', () => {
    expect(extractEmail('sure, my email is hello.world+ig@gmail.com 😊')).toBe(
      'hello.world+ig@gmail.com',
    );
  });

  it('returns null when there is no email', () => {
    expect(extractEmail('no thanks')).toBeNull();
    expect(extractEmail('call me at @handle')).toBeNull();
    expect(extractEmail('')).toBeNull();
    expect(extractEmail(null)).toBeNull();
    expect(extractEmail(undefined)).toBeNull();
  });

  it('does not treat a bare domain or @mention as an email', () => {
    expect(extractEmail('visit example.com')).toBeNull();
    expect(extractEmail('dm @someone')).toBeNull();
  });
});
