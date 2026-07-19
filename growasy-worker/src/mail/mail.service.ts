import nodemailer, { type Transporter } from 'nodemailer';

import type { EnvConfig } from '../config/env';
import { logger } from '../logger/logger';
import { passwordResetEmailTemplate } from './templates/password-reset-email.template';
import { verificationEmailTemplate } from './templates/verification-email.template';
import { welcomeEmailTemplate } from './templates/welcome-email.template';

/**
 * Thin wrapper around a nodemailer SMTP transporter. One instance is created
 * at process startup from validated env config and reused for the lifetime
 * of the worker (SMTP connection pooling is handled by nodemailer itself).
 */
export class MailService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(
    env: Pick<EnvConfig, 'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_USER' | 'SMTP_PASSWORD' | 'MAIL_FROM'>,
  ) {
    this.from = env.MAIL_FROM;
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      // Port 465 is implicit TLS; everything else (587, 25, mailhog's 1025)
      // negotiates STARTTLS or runs plaintext in local dev.
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
  }

  async sendVerificationEmail(payload: {
    toEmail: string;
    firstName: string;
    verificationUrl: string;
  }): Promise<void> {
    const { subject, html, text } = verificationEmailTemplate(payload);
    await this.deliver(payload.toEmail, subject, html, text);
  }

  async sendPasswordResetEmail(payload: {
    toEmail: string;
    firstName: string;
    resetUrl: string;
  }): Promise<void> {
    const { subject, html, text } = passwordResetEmailTemplate(payload);
    await this.deliver(payload.toEmail, subject, html, text);
  }

  async sendWelcomeEmail(payload: { toEmail: string; firstName: string }): Promise<void> {
    const { subject, html, text } = welcomeEmailTemplate(payload);
    await this.deliver(payload.toEmail, subject, html, text);
  }

  private async deliver(to: string, subject: string, html: string, text: string): Promise<void> {
    const info = await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      html,
      text,
    });
    logger.info({ to, subject, messageId: info.messageId }, 'email sent');
  }
}
