import { escapeHtml } from './escape-html';
import { renderLayout } from './layout';
import type { EmailContent } from './types';

/** Sent once, on the day a paid plan actually lapses to Free. */
export function planExpiredEmailTemplate(options: {
  firstName: string;
  planName: string;
  appUrl?: string;
}): EmailContent {
  const { firstName, planName, appUrl } = options;
  const subject = `Your ${planName} plan has ended`;

  const html = renderLayout({
    preheader: `You're on the Free plan now. Your data is untouched — reactivate any time.`,
    heading: `Your ${escapeHtml(planName)} plan has ended`,
    bodyHtml: `
      <p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 16px;">
        Your <strong>${escapeHtml(planName)}</strong> plan has ended and your workspace
        is now on the <strong>Free</strong> plan.
      </p>
      <p style="margin:0 0 16px;">
        Nothing has been deleted — your automations, contacts and history are all
        still there. Free limits now apply, so some automations may be paused until
        you upgrade again.
      </p>
      <p style="margin:0;">Reactivating takes a minute and picks up right where you left off.</p>
    `,
    ...(appUrl ? { ctaLabel: 'Reactivate my plan', ctaUrl: `${appUrl}/billing` } : {}),
  });

  const text = [
    `Hi ${firstName},`,
    '',
    `Your ${planName} plan has ended and your workspace is now on the Free plan.`,
    '',
    'Nothing has been deleted — your automations, contacts and history are all still there. Free limits now apply, so some automations may be paused until you upgrade again.',
    ...(appUrl ? ['', `Reactivate: ${appUrl}/billing`] : []),
  ].join('\n');

  return { subject, html, text };
}
