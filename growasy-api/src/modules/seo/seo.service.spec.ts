import { SeoService } from './seo.service';
import { BlogService } from '../blog/blog.service';
import { AppConfigService } from '../../config/app-config.service';

/**
 * The SEO service emits raw HTML, so it carries the same escaping obligation as
 * the Markdown renderer. These cover the two ways a stored value can escape its
 * context: breaking out of an attribute, and terminating the JSON-LD <script>.
 */

const BASE_POST = {
  id: 'p1',
  slug: 'test-post',
  title: 'A normal title',
  summary: 'A normal summary.',
  content: 'Body text.',
  coverImageUrl: null as string | null,
  coverImageAlt: null as string | null,
  tags: [] as string[],
  readingMinutes: 2,
  publishedAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
  authorName: 'Jane Doe',
  seoTitle: null as string | null,
  seoDescription: null as string | null,
  related: [] as unknown[],
};

function makeService(overrides: Partial<typeof BASE_POST> = {}) {
  const post = { ...BASE_POST, ...overrides };
  const blog = {
    getPublishedBySlug: jest.fn().mockResolvedValue(post),
    listPublished: jest.fn().mockResolvedValue({ items: [post] }),
    listPublishedSlugs: jest.fn().mockResolvedValue([]),
  } as unknown as BlogService;
  const config = { webAppUrl: 'https://app.getautomiq.in' } as AppConfigService;
  return new SeoService(blog, config);
}

describe('SeoService — output escaping', () => {
  it('does not let a title terminate the JSON-LD script element', async () => {
    // JSON.stringify escapes quotes but not `</script>`, so without the extra
    // escaping this payload would close the element and run as markup.
    const html = await makeService({
      title: '</script><img src=x onerror=alert(1)>',
    }).blogPostHtml('test-post');

    expect(html).not.toContain('</script><img');
    expect(html).toContain('\\u003c/script');
    // Exactly the script tags we emit, none introduced by content.
    expect(html!.match(/<script/g)).toHaveLength(2);
  });

  it('escapes a cover image URL so it cannot break out of the attribute', async () => {
    const html = await makeService({
      coverImageUrl: 'https://x.com/a.jpg" onerror="alert(1)',
      coverImageAlt: 'alt',
    }).blogPostHtml('test-post');

    expect(html).not.toContain('onerror="alert(1)"');
    expect(html).toContain('&quot;');
  });

  it('escapes the title, summary and tags in the body', async () => {
    const html = await makeService({
      title: '<b>bold</b>',
      summary: '<i>italic</i>',
      tags: ['<script>x</script>'],
    }).blogPostHtml('test-post');

    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
    expect(html).toContain('&lt;i&gt;italic&lt;/i&gt;');
    expect(html).not.toContain('<script>x');
  });

  it('escapes post titles on the index page too', async () => {
    const html = await makeService({ title: '</script><b>x</b>' }).blogIndexHtml();
    expect(html).not.toContain('</script><b>');
    expect(html.match(/<script/g)).toHaveLength(1);
  });

  it('returns null for a slug that is not published', async () => {
    const blog = {
      getPublishedBySlug: jest.fn().mockRejectedValue(new Error('not found')),
    } as unknown as BlogService;
    const svc = new SeoService(blog, { webAppUrl: 'https://x.test' } as AppConfigService);

    await expect(svc.blogPostHtml('missing')).resolves.toBeNull();
  });
});
