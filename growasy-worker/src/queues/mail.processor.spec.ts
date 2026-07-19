import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

import type { MailService } from '../mail/mail.service';
import { dispatchMailJob } from './mail.processor';
import { MAIL_JOB_NAMES } from './queue-names.constant';

function fakeJob(name: string, data: unknown): Job {
  return { name, data } as unknown as Job;
}

function fakeMailService(): MailService {
  return {
    sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
    sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  } as unknown as MailService;
}

describe('dispatchMailJob', () => {
  it('dispatches send-verification-email jobs to mailService.sendVerificationEmail', async () => {
    const mailService = fakeMailService();
    const payload = {
      toEmail: 'jane@example.com',
      firstName: 'Jane',
      verificationUrl: 'https://app.growasy.test/verify-email?token=abc',
    };

    await dispatchMailJob(fakeJob(MAIL_JOB_NAMES.SEND_VERIFICATION_EMAIL, payload), mailService);

    expect(mailService.sendVerificationEmail).toHaveBeenCalledWith(payload);
    expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(mailService.sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it('dispatches send-password-reset-email jobs to mailService.sendPasswordResetEmail', async () => {
    const mailService = fakeMailService();
    const payload = {
      toEmail: 'jane@example.com',
      firstName: 'Jane',
      resetUrl: 'https://app.growasy.test/reset-password?token=xyz',
    };

    await dispatchMailJob(fakeJob(MAIL_JOB_NAMES.SEND_PASSWORD_RESET_EMAIL, payload), mailService);

    expect(mailService.sendPasswordResetEmail).toHaveBeenCalledWith(payload);
    expect(mailService.sendVerificationEmail).not.toHaveBeenCalled();
    expect(mailService.sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it('dispatches send-welcome-email jobs to mailService.sendWelcomeEmail', async () => {
    const mailService = fakeMailService();
    const payload = { toEmail: 'jane@example.com', firstName: 'Jane' };

    await dispatchMailJob(fakeJob(MAIL_JOB_NAMES.SEND_WELCOME_EMAIL, payload), mailService);

    expect(mailService.sendWelcomeEmail).toHaveBeenCalledWith(payload);
    expect(mailService.sendVerificationEmail).not.toHaveBeenCalled();
    expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('throws on an unrecognized job name instead of silently succeeding', async () => {
    const mailService = fakeMailService();

    await expect(dispatchMailJob(fakeJob('some-unknown-job', {}), mailService)).rejects.toThrow(
      /Unrecognized job name/,
    );

    expect(mailService.sendVerificationEmail).not.toHaveBeenCalled();
    expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(mailService.sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it('propagates errors thrown by the mail service so BullMQ retries the job', async () => {
    const mailService = fakeMailService();
    (mailService.sendWelcomeEmail as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('smtp down'),
    );

    await expect(
      dispatchMailJob(
        fakeJob(MAIL_JOB_NAMES.SEND_WELCOME_EMAIL, { toEmail: 'a@b.com', firstName: 'A' }),
        mailService,
      ),
    ).rejects.toThrow('smtp down');
  });
});
