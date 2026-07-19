import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema, resetPasswordSchema } from '@/schemas/auth.schemas';

describe('loginSchema', () => {
  it('accepts a valid email/password pair', () => {
    const result = loginSchema.safeParse({
      email: 'jane@acme.com',
      password: 'anything',
      rememberMe: true,
    });
    expect(result.success).toBe(true);
  });

  it('defaults rememberMe to false when omitted', () => {
    const result = loginSchema.safeParse({ email: 'jane@acme.com', password: 'anything' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rememberMe).toBe(false);
    }
  });

  it('rejects an invalid email', () => {
    const result = loginSchema.safeParse({ email: 'not-an-email', password: 'anything' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.email?.[0]).toMatch(/valid email/i);
    }
  });

  it('rejects an empty password', () => {
    const result = loginSchema.safeParse({ email: 'jane@acme.com', password: '' });
    expect(result.success).toBe(false);
  });
});

describe('registerSchema', () => {
  const base = {
    email: 'jane@acme.com',
    password: 'S3curePass',
    firstName: 'Jane',
    lastName: 'Doe',
  };

  it('accepts a fully valid payload including optional organizationName', () => {
    const result = registerSchema.safeParse({ ...base, organizationName: "Jane's Workspace" });
    expect(result.success).toBe(true);
  });

  it('accepts a payload without organizationName', () => {
    const result = registerSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it.each([
    ['short', 'short1'], // < 8 chars
    ['letters only', 'onlyletters'],
    ['digits only', '12345678'],
  ])('rejects a password that is %s', (_label, password) => {
    const result = registerSchema.safeParse({ ...base, password });
    expect(result.success).toBe(false);
  });

  it('accepts a password with exactly one letter and one digit mixed in', () => {
    const result = registerSchema.safeParse({ ...base, password: 'abcdefg1' });
    expect(result.success).toBe(true);
  });

  it('rejects a missing firstName', () => {
    const result = registerSchema.safeParse({ ...base, firstName: '' });
    expect(result.success).toBe(false);
  });

  it('rejects an email over 255 characters', () => {
    const longLocal = 'a'.repeat(250);
    const result = registerSchema.safeParse({ ...base, email: `${longLocal}@acme.com` });
    expect(result.success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('accepts matching passwords that satisfy the complexity rule', () => {
    const result = resetPasswordSchema.safeParse({
      newPassword: 'NewPass1',
      confirmPassword: 'NewPass1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects mismatched passwords and attaches the error to confirmPassword', () => {
    const result = resetPasswordSchema.safeParse({
      newPassword: 'NewPass1',
      confirmPassword: 'Different1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.confirmPassword?.[0]).toMatch(/do not match/i);
    }
  });

  it('rejects a new password that fails the letter+digit rule', () => {
    const result = resetPasswordSchema.safeParse({
      newPassword: 'alllettersnodigits',
      confirmPassword: 'alllettersnodigits',
    });
    expect(result.success).toBe(false);
  });
});
