import { describe, expect, it } from 'vitest';
import { markdownToText, renderMarkdown } from '@/lib/markdown';

/**
 * The renderer's output goes through dangerouslySetInnerHTML, so the escaping
 * guarantee is the security boundary — these tests are what makes that safe to
 * rely on. Everything is escaped before any tag is emitted, which means stored
 * post content cannot introduce an element or an attribute.
 */
describe('renderMarkdown — escaping', () => {
  it('renders a script tag as text, never as an element', () => {
    const html = renderMarkdown('Hello <script>alert(1)</script> world');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;');
  });

  it('neutralises an img onerror payload', () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">');
    // The word survives as visible text — what matters is that no <img> element
    // is emitted, so there is no attribute for the handler to attach to.
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('onerror=&quot;');
  });

  it('drops a javascript: link but keeps the text', () => {
    const html = renderMarkdown('[click me](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<a href');
    expect(html).toContain('click me');
  });

  it('drops a data: image source', () => {
    const html = renderMarkdown('![x](data:text/html;base64,PHNjcmlwdD4=)');
    expect(html).not.toContain('data:text/html');
    expect(html).not.toContain('<img');
  });

  it('escapes quotes so an attribute cannot be broken out of', () => {
    const html = renderMarkdown('He said "hi" and it\'s fine');
    expect(html).toContain('&quot;');
    expect(html).toContain('&#39;');
  });
});

describe('renderMarkdown — formatting', () => {
  it('renders headings at the right level', () => {
    expect(renderMarkdown('# One')).toContain('<h1');
    expect(renderMarkdown('### Three')).toContain('<h3');
  });

  it('renders bold, italic and inline code', () => {
    const html = renderMarkdown('This is **bold**, *italic* and `code`.');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<code');
  });

  it('renders an https link with safe rel attributes', () => {
    const html = renderMarkdown('[Automiq](https://app.getautomiq.in)');
    expect(html).toContain('href="https://app.getautomiq.in"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('renders unordered and ordered lists', () => {
    expect(renderMarkdown('- one\n- two')).toContain('<ul');
    expect(renderMarkdown('1. one\n2. two')).toContain('<ol');
  });

  it('renders a fenced code block without treating its contents as markdown', () => {
    const html = renderMarkdown('```\n# not a heading\n**not bold**\n```');
    expect(html).toContain('<pre');
    expect(html).not.toContain('<h1');
    expect(html).not.toContain('<strong>');
  });

  it('closes an unterminated code fence instead of dropping the content', () => {
    const html = renderMarkdown('```\nconst a = 1;');
    expect(html).toContain('<pre');
    expect(html).toContain('const a = 1;');
  });

  it('renders blockquotes, which arrive already escaped as &gt;', () => {
    expect(renderMarkdown('> quoted')).toContain('<blockquote');
  });

  it('groups consecutive lines into one paragraph and splits on a blank line', () => {
    const html = renderMarkdown('line one\nline two\n\nsecond para');
    expect(html.match(/<p /g)).toHaveLength(2);
  });
});

describe('markdownToText', () => {
  it('strips markup for use as a preview', () => {
    expect(markdownToText('## Title\n\nSome **bold** text with [a link](https://x.com).')).toBe(
      'Title Some bold text with a link.',
    );
  });

  it('truncates with an ellipsis', () => {
    expect(markdownToText('a'.repeat(300), 50)).toHaveLength(50);
  });
});
