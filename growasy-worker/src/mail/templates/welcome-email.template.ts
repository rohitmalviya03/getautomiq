import { escapeHtml } from './escape-html';
import { renderLayout } from './layout';
import type { EmailContent } from './types';

export function welcomeEmailTemplate(options: { firstName: string }): EmailContent {
  const { firstName } = options;
  const subject = 'Welcome to Growasy';

  const html = renderLayout({
    preheader: 'Your Growasy account is verified and ready to go.',
    heading: `Welcome aboard, ${escapeHtml(firstName)}`,
    bodyHtml: `
      <p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0;">
        Your email is verified and your Growasy account is ready. You can now connect
        an Instagram account and start building automations — from comment-triggered
        DMs to keyword-based auto-replies.
      </p>
    `,
  });

  const text = [
    `Hi ${firstName},`,
    '',
    'Your email is verified and your Growasy account is ready. You can now connect an Instagram account and start building automations.',
    '',
    'Welcome aboard!',
  ].join('\n');

  return { subject, html, text };
}
