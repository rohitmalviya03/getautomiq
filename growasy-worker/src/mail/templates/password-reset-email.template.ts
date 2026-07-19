import { escapeHtml } from './escape-html';
import { renderLayout } from './layout';
import type { EmailContent } from './types';

export function passwordResetEmailTemplate(options: {
  firstName: string;
  resetUrl: string;
}): EmailContent {
  const { firstName, resetUrl } = options;
  const subject = 'Reset your Growasy password';

  const html = renderLayout({
    preheader: 'Use this link to reset your Growasy password.',
    heading: 'Reset your password',
    bodyHtml: `
      <p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0;">
        We received a request to reset the password for your Growasy account.
        Click the button below to choose a new password. This link expires in 60 minutes.
      </p>
    `,
    ctaLabel: 'Reset password',
    ctaUrl: resetUrl,
  });

  const text = [
    `Hi ${firstName},`,
    '',
    'We received a request to reset the password for your Growasy account. Visit the link below to choose a new password. This link expires in 60 minutes.',
    '',
    resetUrl,
    '',
    "If you didn't request a password reset, you can safely ignore this email — your password will not change.",
  ].join('\n');

  return { subject, html, text };
}
