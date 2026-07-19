import { escapeHtml } from './escape-html';
import { renderLayout } from './layout';
import type { EmailContent } from './types';

export function verificationEmailTemplate(options: {
  firstName: string;
  verificationUrl: string;
}): EmailContent {
  const { firstName, verificationUrl } = options;
  const subject = 'Verify your Growasy email address';

  const html = renderLayout({
    preheader: 'Confirm your email address to activate your Growasy account.',
    heading: 'Confirm your email address',
    bodyHtml: `
      <p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0;">
        Thanks for signing up for Growasy. Please confirm this is your email address
        by clicking the button below. This link expires in 24 hours.
      </p>
    `,
    ctaLabel: 'Verify email address',
    ctaUrl: verificationUrl,
  });

  const text = [
    `Hi ${firstName},`,
    '',
    'Thanks for signing up for Growasy. Please confirm this is your email address by visiting the link below. This link expires in 24 hours.',
    '',
    verificationUrl,
    '',
    "If you didn't create a Growasy account, you can safely ignore this email.",
  ].join('\n');

  return { subject, html, text };
}
