import { escapeHtml } from './escape-html';
import { renderLayout } from './layout';
import type { EmailContent } from './types';

/** What the product actually does today — kept deliberately concrete. */
const HIGHLIGHTS: { title: string; detail: string }[] = [
  {
    title: 'Comment → DM',
    detail: 'Someone comments your keyword on a post or reel, they get your link in a DM.',
  },
  {
    title: 'Keyword auto-replies',
    detail: 'Answer DMs and story replies automatically, around the clock.',
  },
  {
    title: 'Lead capture + CRM',
    detail: 'Collect emails inside the DM flow and keep every contact in one place.',
  },
  {
    title: 'Link tracking & analytics',
    detail: 'See which posts and reels actually bring conversations.',
  },
];

export function welcomeEmailTemplate(options: {
  firstName: string;
  appUrl?: string;
}): EmailContent {
  const { firstName, appUrl } = options;
  const subject = 'Welcome to Automiq — here’s how to get your first automation live';

  const list = HIGHLIGHTS.map(
    (h) => `
      <tr>
        <td style="padding:0 0 14px;">
          <strong style="color:#111827;">${escapeHtml(h.title)}</strong><br />
          <span style="color:#4b5563;">${escapeHtml(h.detail)}</span>
        </td>
      </tr>`,
  ).join('');

  const html = renderLayout({
    preheader: 'Connect Instagram, pick a template, and your first automation is live.',
    heading: `Welcome aboard, ${escapeHtml(firstName)}`,
    bodyHtml: `
      <p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 20px;">
        Your account is ready. Automiq turns Instagram comments and DMs into
        conversations that run without you:
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-size:15px;line-height:22px;">
        ${list}
      </table>
      <p style="margin:20px 0 0;">
        Getting started takes about two minutes: connect your Instagram account,
        pick a ready-made template, and turn it on.
      </p>
    `,
    ...(appUrl ? { ctaLabel: 'Connect Instagram', ctaUrl: `${appUrl}/instagram/accounts` } : {}),
  });

  const text = [
    `Hi ${firstName},`,
    '',
    'Your Automiq account is ready. Automiq turns Instagram comments and DMs into conversations that run without you:',
    '',
    ...HIGHLIGHTS.map((h) => `- ${h.title}: ${h.detail}`),
    '',
    'Getting started takes about two minutes: connect your Instagram account, pick a ready-made template, and turn it on.',
    ...(appUrl ? ['', `Connect Instagram: ${appUrl}/instagram/accounts`] : []),
  ].join('\n');

  return { subject, html, text };
}
