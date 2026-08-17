import { escapeHtml } from './escape-html';
import { renderLayout } from './layout';
import type { EmailContent } from './types';

/**
 * A message written by hand in the admin console and sent to a customer.
 *
 * Unlike every other template here the wording is not ours — it arrives as
 * plain text from whoever is on support. That makes escaping the boundary that
 * matters: `body` is escaped and only then given paragraph breaks, so a stray
 * `<` in someone's message is text, and a pasted `<script>` never becomes one.
 * There is deliberately no way to send raw HTML through this path.
 */
export function adminMessageEmailTemplate(options: {
  firstName: string;
  subject: string;
  body: string;
  appUrl?: string;
}): EmailContent {
  const { firstName, subject, body, appUrl } = options;

  // Blank lines start a new paragraph; single newlines are line breaks. Escape
  // first, split second — the other order would let markup through.
  const paragraphs = escapeHtml(body.trim())
    .split(/\n{2,}/)
    .map((block) => block.replace(/\n/g, '<br />'))
    .filter(Boolean)
    .map((block) => `<p style="margin:0 0 16px;">${block}</p>`)
    .join('');

  // The preheader is the grey line inboxes show next to the subject. Feeding it
  // the opening words beats a generic string the reader has to look past.
  const preheader = body.trim().replace(/\s+/g, ' ').slice(0, 140);

  const html = renderLayout({
    preheader,
    heading: escapeHtml(subject),
    bodyHtml: `
      <p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
      ${paragraphs}
      <p style="margin:24px 0 0; color:#6b7280; font-size:13px;">
        Reply to this email and it reaches the Automiq team directly.
      </p>`,
    ...(appUrl ? { ctaLabel: 'Open Automiq', ctaUrl: appUrl } : {}),
  });

  const text = [`Hi ${firstName},`, '', body.trim(), '', 'Reply to this email to reach us.'].join(
    '\n',
  );

  return { subject, html, text };
}
