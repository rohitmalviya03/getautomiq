import { renderMarkdown } from './markdown';

/**
 * This output is served as raw HTML to crawlers, so the escape-first guarantee
 * is the security boundary — the same one the browser renderer relies on.
 */
describe('renderMarkdown (server)', () => {
  it('renders a script tag as text, never as an element', () => {
    const html = renderMarkdown('Hello <script>alert(1)</script>');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;');
  });

  it('emits no img element for an inline HTML image payload', () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('drops javascript: and data: URLs but keeps the text', () => {
    expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('javascript:');
    expect(renderMarkdown('![x](data:text/html;base64,abc)')).not.toContain('data:text/html');
  });

  it('keeps http(s), mailto and site-relative links', () => {
    expect(renderMarkdown('[a](https://example.com)')).toContain('href="https://example.com"');
    expect(renderMarkdown('[a](mailto:x@y.com)')).toContain('href="mailto:x@y.com"');
    expect(renderMarkdown('[a](/blog)')).toContain('href="/blog"');
  });

  it('produces semantic tags without styling classes', () => {
    const html = renderMarkdown('# Title\n\nSome **bold** text.\n\n- one\n- two');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<ul>');
    expect(html).not.toContain('class=');
  });

  it('does not treat the contents of a code fence as markdown', () => {
    const html = renderMarkdown('```\n# not a heading\n```');
    expect(html).toContain('<pre><code>');
    expect(html).not.toContain('<h1>');
  });
});
