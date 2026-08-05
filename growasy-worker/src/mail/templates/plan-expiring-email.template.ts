import { escapeHtml } from './escape-html';
import { renderLayout } from './layout';
import type { EmailContent } from './types';

/**
 * Heads-up sent a few days before a paid plan lapses. Only goes to
 * subscriptions that will NOT renew (cancelled or comped), so it never nags
 * someone whose plan is simply rolling over.
 */
export function planExpiringEmailTemplate(options: {
  firstName: string;
  planName: string;
  /** Human-readable end date, already formatted by the caller. */
  endsAt: string;
  daysLeft: number;
  appUrl?: string;
}): EmailContent {
  const { firstName, planName, endsAt, daysLeft, appUrl } = options;
  const when = daysLeft <= 1 ? 'tomorrow' : `in ${daysLeft} days`;
  const subject = `Your ${planName} plan ends ${when}`;

  const html = renderLayout({
    preheader: `${planName} ends on ${endsAt}. Renew to keep your automations running.`,
    heading: `Your ${escapeHtml(planName)} plan ends ${escapeHtml(when)}`,
    bodyHtml: `
      <p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 16px;">
        Your <strong>${escapeHtml(planName)}</strong> plan is set to end on
        <strong>${escapeHtml(endsAt)}</strong> and won’t renew automatically.
      </p>
      <p style="margin:0;">
        After that your workspace moves to the Free plan. Your automations, contacts
        and data stay exactly where they are — but the higher limits and paid
        features stop applying, and active automations beyond the Free limits will
        stop running.
      </p>
    `,
    ...(appUrl ? { ctaLabel: 'Renew my plan', ctaUrl: `${appUrl}/billing` } : {}),
  });

  const text = [
    `Hi ${firstName},`,
    '',
    `Your ${planName} plan is set to end on ${endsAt} and won't renew automatically.`,
    '',
    'After that your workspace moves to the Free plan. Your automations, contacts and data stay where they are, but the higher limits and paid features stop applying.',
    ...(appUrl ? ['', `Renew: ${appUrl}/billing`] : []),
  ].join('\n');

  return { subject, html, text };
}
