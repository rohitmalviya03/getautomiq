import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'mocked-message-id' });
const createTransportMock = vi.fn((..._args: unknown[]) => ({ sendMail: sendMailMock }));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: (...args: unknown[]) => createTransportMock(...args),
  },
}));

// Imported after the mock so MailService picks up the mocked transporter.
import { MailService } from './mail.service';

const baseEnv = {
  SMTP_HOST: 'localhost',
  SMTP_PORT: 1025,
  SMTP_USER: '',
  SMTP_PASSWORD: '',
  MAIL_FROM: 'Growasy <no-reply@growasy.app>',
};

describe('MailService', () => {
  beforeEach(() => {
    sendMailMock.mockClear();
    createTransportMock.mockClear();
  });

  it('creates a nodemailer transport from SMTP env config', () => {
    new MailService(baseEnv);

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'localhost', port: 1025, secure: false }),
    );
  });

  it('uses implicit TLS (secure: true) for port 465', () => {
    new MailService({ ...baseEnv, SMTP_PORT: 465 });

    expect(createTransportMock).toHaveBeenCalledWith(expect.objectContaining({ secure: true }));
  });

  it('sends a verification email with the correct recipient, subject, and link', async () => {
    const mailService = new MailService(baseEnv);

    await mailService.sendVerificationEmail({
      toEmail: 'jane@example.com',
      firstName: 'Jane',
      verificationUrl: 'https://app.growasy.test/verify-email?token=abc123',
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const call = sendMailMock.mock.calls[0][0];
    expect(call.from).toBe(baseEnv.MAIL_FROM);
    expect(call.to).toBe('jane@example.com');
    expect(call.subject).toMatch(/verify/i);
    expect(call.html).toContain('https://app.growasy.test/verify-email?token=abc123');
    expect(call.html).toContain('Jane');
    expect(call.text).toContain('https://app.growasy.test/verify-email?token=abc123');
  });

  it('sends a password reset email with the correct recipient, subject, and link', async () => {
    const mailService = new MailService(baseEnv);

    await mailService.sendPasswordResetEmail({
      toEmail: 'jane@example.com',
      firstName: 'Jane',
      resetUrl: 'https://app.growasy.test/reset-password?token=xyz789',
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const call = sendMailMock.mock.calls[0][0];
    expect(call.to).toBe('jane@example.com');
    expect(call.subject).toMatch(/reset/i);
    expect(call.html).toContain('https://app.growasy.test/reset-password?token=xyz789');
    expect(call.text).toContain('https://app.growasy.test/reset-password?token=xyz789');
  });

  it('sends a welcome email with the recipient name and no broken template placeholders', async () => {
    const mailService = new MailService(baseEnv);

    await mailService.sendWelcomeEmail({
      toEmail: 'jane@example.com',
      firstName: 'Jane',
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const call = sendMailMock.mock.calls[0][0];
    expect(call.to).toBe('jane@example.com');
    expect(call.subject).toMatch(/welcome/i);
    expect(call.html).toContain('Jane');
    expect(call.html).not.toContain('undefined');
    expect(call.text).not.toContain('undefined');
  });

  it('escapes HTML-significant characters in the first name to avoid markup injection', async () => {
    const mailService = new MailService(baseEnv);

    await mailService.sendVerificationEmail({
      toEmail: 'jane@example.com',
      firstName: '<script>alert(1)</script>',
      verificationUrl: 'https://app.growasy.test/verify-email?token=abc123',
    });

    const call = sendMailMock.mock.calls[0][0];
    expect(call.html).not.toContain('<script>alert(1)</script>');
    expect(call.html).toContain('&lt;script&gt;');
  });

  it('propagates errors from the SMTP transport instead of swallowing them', async () => {
    sendMailMock.mockRejectedValueOnce(new Error('smtp connection refused'));
    const mailService = new MailService(baseEnv);

    await expect(
      mailService.sendWelcomeEmail({ toEmail: 'jane@example.com', firstName: 'Jane' }),
    ).rejects.toThrow('smtp connection refused');
  });
});
