import { describe, expect, it } from 'vitest';
import { adminMessageEmailTemplate } from './admin-message-email.template';

const base = { firstName: 'Rohit', subject: 'About your account', body: 'Hello there.' };

describe('adminMessageEmailTemplate', () => {
  it('uses the admin-written subject verbatim', () => {
    const mail = adminMessageEmailTemplate(base);
    expect(mail.subject).toBe('About your account');
  });

  it('escapes markup in the body instead of rendering it', () => {
    const mail = adminMessageEmailTemplate({
      ...base,
      body: 'Check <script>alert(1)</script> this',
    });

    // The text survives, but never as an element.
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('escapes markup in the subject where it is shown as a heading', () => {
    const mail = adminMessageEmailTemplate({ ...base, subject: '<img src=x onerror=1>' });

    expect(mail.html).not.toContain('<img');
    // The raw subject still goes on the envelope — headers are not HTML.
    expect(mail.subject).toBe('<img src=x onerror=1>');
  });

  it('turns blank lines into paragraphs and single newlines into breaks', () => {
    const mail = adminMessageEmailTemplate({
      ...base,
      body: 'First line\nsame paragraph\n\nSecond paragraph',
    });

    expect(mail.html).toContain('First line<br />same paragraph');
    expect(mail.html).toContain('Second paragraph');
    // Two paragraphs, not one blob.
    expect(mail.html.match(/<p style="margin:0 0 16px;">/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('greets the customer by name, escaped', () => {
    const mail = adminMessageEmailTemplate({ ...base, firstName: '<b>Rohit' });
    expect(mail.html).toContain('&lt;b&gt;Rohit');
    expect(mail.html).not.toContain('<b>Rohit');
  });

  it('ships a plain-text alternative carrying the same message', () => {
    const mail = adminMessageEmailTemplate({ ...base, body: 'Your plan renews on Friday.' });
    expect(mail.text).toContain('Hi Rohit,');
    expect(mail.text).toContain('Your plan renews on Friday.');
  });

  it('builds the inbox preview line from the opening words', () => {
    const mail = adminMessageEmailTemplate({
      ...base,
      body: '  Your DM limit   was raised.\n\nEnjoy.',
    });
    // Whitespace collapsed so the preview does not start with a gap.
    expect(mail.html).toContain('Your DM limit was raised.');
  });
});
