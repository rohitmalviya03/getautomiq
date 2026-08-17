/**
 * Shared branded HTML shell for transactional emails. Keeping this in one
 * place means every email looks consistent and table-based markup (for
 * maximum email-client compatibility) only has to be gotten right once.
 */
import { escapeHtml } from './escape-html';

export function renderLayout(options: {
  preheader: string;
  heading: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): string {
  const { preheader, heading, bodyHtml, ctaLabel, ctaUrl } = options;

  // `preheader` is escaped here rather than at each call site. Most callers pass
  // a fixed sentence, but the admin-message template derives it from text a
  // human typed — escaping at the boundary means no future caller has to
  // remember. `heading` and `bodyHtml` are the caller's job: they legitimately
  // carry markup, so they are escaped where they are built.

  const button =
    ctaLabel && ctaUrl
      ? `
      <tr>
        <td align="center" style="padding: 32px 0;">
          <a href="${ctaUrl}"
             style="background-color:#7c3aed;color:#ffffff;display:inline-block;
                    font-family:Arial,Helvetica,sans-serif;font-size:16px;
                    font-weight:bold;line-height:1;padding:14px 32px;
                    text-decoration:none;border-radius:8px;">
            ${ctaLabel}
          </a>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding: 0 24px 8px;">
          <p style="margin:0;color:#6b7280;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;word-break:break-all;">
            Or copy and paste this link into your browser:<br />
            <a href="${ctaUrl}" style="color:#7c3aed;">${ctaUrl}</a>
          </p>
        </td>
      </tr>`
      : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${heading}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f4f7;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0"
                 style="background-color:#ffffff;border-radius:12px;overflow:hidden;max-width:480px;width:100%;">
            <tr>
              <td style="background-color:#111827;padding:24px 32px;">
                <span style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;">
                  Automiq
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 32px 0;">
                <h1 style="margin:0 0 16px;color:#111827;font-family:Arial,Helvetica,sans-serif;font-size:22px;">
                  ${heading}
                </h1>
                <div style="color:#374151;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;">
                  ${bodyHtml}
                </div>
              </td>
            </tr>
            ${button}
            <tr>
              <td style="padding:24px 32px 32px;border-top:1px solid #e5e7eb;">
                <p style="margin:16px 0 0;color:#9ca3af;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;">
                  You're receiving this email because of activity on your Automiq account.
                  If you didn't expect this, you can safely ignore it.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
