import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { BlogService } from '../blog/blog.service';
import { escapeHtml, renderMarkdown } from './markdown';

/**
 * Crawler-facing HTML.
 *
 * The product is a client-rendered SPA, which means a crawler that doesn't run
 * JavaScript sees `<div id="root"></div>` and nothing else. Google renders JS
 * (slowly); the AI answer engines we explicitly invite in robots.txt — GPTBot,
 * PerplexityBot, ClaudeBot — do not. Without this, every blog post is invisible
 * to them.
 *
 * So nginx routes crawler requests here and gets a complete, static page:
 * real <title>, meta description, canonical, Open Graph, JSON-LD and the full
 * article body. This is "dynamic rendering" — same URL, same content, just
 * pre-rendered for clients that can't run scripts. It is not cloaking: the text
 * served is exactly what a browser ends up displaying.
 */
@Injectable()
export class SeoService {
  constructor(
    private readonly blog: BlogService,
    private readonly config: AppConfigService,
  ) {}

  private get siteUrl(): string {
    return this.config.webAppUrl.replace(/\/$/, '');
  }

  /** Shared document shell. `head` and `body` are already-escaped HTML. */
  private page(options: {
    title: string;
    description: string;
    canonical: string;
    head?: string;
    body: string;
  }): string {
    const { title, description, canonical, head = '', body } = options;
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<link rel="canonical" href="${canonical}" />
<meta property="og:site_name" content="Automiq" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${canonical}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
${head}
</head>
<body>
${body}
<hr />
<footer>
<p><a href="${this.siteUrl}/">Automiq</a> — Instagram automation for creators and businesses.
<a href="${this.siteUrl}/blog">Blog</a> ·
<a href="${this.siteUrl}/tools">Free tools</a> ·
<a href="${this.siteUrl}/register">Start free</a></p>
</footer>
</body>
</html>`;
  }

  /** The blog index, as a crawler sees it. */
  async blogIndexHtml(): Promise<string> {
    const { items } = await this.blog.listPublished({ page: 1, pageSize: 50 });
    const canonical = `${this.siteUrl}/blog`;

    const list = items
      .map(
        (p) => `<article>
<h2><a href="${this.siteUrl}/blog/${p.slug}">${escapeHtml(p.title)}</a></h2>
<p>${escapeHtml(p.summary)}</p>
<p><small>${p.publishedAt ? new Date(p.publishedAt).toISOString().slice(0, 10) : ''} · ${p.readingMinutes} min read${p.authorName ? ` · ${escapeHtml(p.authorName)}` : ''}</small></p>
</article>`,
      )
      .join('\n');

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: 'Automiq Blog',
      url: canonical,
      blogPost: items.map((p) => ({
        '@type': 'BlogPosting',
        headline: p.title,
        description: p.summary,
        url: `${this.siteUrl}/blog/${p.slug}`,
        datePublished: p.publishedAt ?? undefined,
      })),
    };

    return this.page({
      title: 'Blog — Instagram automation guides & playbooks | Automiq',
      description:
        'Practical guides on Instagram automation, comment-to-DM funnels, lead capture and growth for creators and businesses.',
      canonical,
      head: `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
      body: `<h1>The Automiq blog</h1>
<p>Playbooks on Instagram automation, comment-to-DM funnels and turning conversations into customers.</p>
${list || '<p>No posts published yet.</p>'}`,
    });
  }

  /** A single article, fully rendered. Returns null when the slug isn't live. */
  async blogPostHtml(slug: string): Promise<string | null> {
    let post: Awaited<ReturnType<BlogService['getPublishedBySlug']>>;
    try {
      post = await this.blog.getPublishedBySlug(slug);
    } catch {
      return null; // unpublished or unknown — let nginx fall back to the SPA
    }

    const canonical = `${this.siteUrl}/blog/${post.slug}`;
    const description = post.seoDescription ?? post.summary;

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description,
      url: canonical,
      datePublished: post.publishedAt ?? undefined,
      dateModified: post.updatedAt,
      ...(post.coverImageUrl ? { image: post.coverImageUrl } : {}),
      ...(post.authorName ? { author: { '@type': 'Person', name: post.authorName } } : {}),
      publisher: { '@type': 'Organization', name: 'Automiq', url: `${this.siteUrl}/` },
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
      ...(post.tags.length > 0 ? { keywords: post.tags.join(', ') } : {}),
    };

    const breadcrumbs = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${this.siteUrl}/` },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: `${this.siteUrl}/blog` },
        { '@type': 'ListItem', position: 3, name: post.title, item: canonical },
      ],
    };

    const related = post.related
      .map((r) => `<li><a href="${this.siteUrl}/blog/${r.slug}">${escapeHtml(r.title)}</a></li>`)
      .join('\n');

    return this.page({
      title: post.seoTitle ?? `${post.title} | Automiq`,
      description,
      canonical,
      head: [
        '<meta property="og:type" content="article" />',
        post.publishedAt
          ? `<meta property="article:published_time" content="${new Date(post.publishedAt).toISOString()}" />`
          : '',
        `<meta property="article:modified_time" content="${new Date(post.updatedAt).toISOString()}" />`,
        ...post.tags.map((t) => `<meta property="article:tag" content="${escapeHtml(t)}" />`),
        post.coverImageUrl
          ? `<meta property="og:image" content="${post.coverImageUrl}" /><meta name="twitter:image" content="${post.coverImageUrl}" />`
          : '',
        `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
        `<script type="application/ld+json">${JSON.stringify(breadcrumbs)}</script>`,
      ]
        .filter(Boolean)
        .join('\n'),
      body: `<article>
<h1>${escapeHtml(post.title)}</h1>
<p>${escapeHtml(post.summary)}</p>
<p><small>${post.authorName ? `${escapeHtml(post.authorName)} · ` : ''}${post.publishedAt ? new Date(post.publishedAt).toISOString().slice(0, 10) : ''} · ${post.readingMinutes} min read</small></p>
${post.coverImageUrl ? `<img src="${post.coverImageUrl}" alt="${escapeHtml(post.coverImageAlt ?? '')}" />` : ''}
${renderMarkdown(post.content)}
</article>
${related ? `<nav><h2>Keep reading</h2><ul>${related}</ul></nav>` : ''}`,
    });
  }

  /**
   * The whole sitemap, static routes plus every published post. Served from here
   * rather than the static file so a new post is discoverable the moment it goes
   * live, without a redeploy.
   */
  async sitemapXml(): Promise<string> {
    const today = new Date().toISOString().slice(0, 10);
    const staticRoutes: { path: string; changefreq: string; priority: string }[] = [
      { path: '/', changefreq: 'weekly', priority: '1.0' },
      { path: '/blog', changefreq: 'daily', priority: '0.9' },
      { path: '/tools', changefreq: 'weekly', priority: '0.9' },
      { path: '/tools/instagram-hashtag-generator', changefreq: 'monthly', priority: '0.8' },
      { path: '/tools/instagram-caption-generator', changefreq: 'monthly', priority: '0.8' },
      { path: '/tools/engagement-rate-calculator', changefreq: 'monthly', priority: '0.8' },
      { path: '/register', changefreq: 'monthly', priority: '0.6' },
      { path: '/privacy', changefreq: 'yearly', priority: '0.3' },
      { path: '/terms', changefreq: 'yearly', priority: '0.3' },
    ];

    const posts = await this.blog.listPublishedSlugs();

    const urls = [
      ...staticRoutes.map(
        (r) =>
          `  <url>\n    <loc>${this.siteUrl}${r.path}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${r.changefreq}</changefreq>\n    <priority>${r.priority}</priority>\n  </url>`,
      ),
      ...posts.map(
        (p) =>
          `  <url>\n    <loc>${this.siteUrl}/blog/${p.slug}</loc>\n    <lastmod>${p.updatedAt}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`,
      ),
    ].join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  }

  /**
   * llms.txt — the file AI answer engines read first. Listing every published
   * post with its summary is the cheapest way to get cited, because it tells
   * them what exists without them having to crawl and render each page.
   */
  async llmsTxt(): Promise<string> {
    const { items } = await this.blog.listPublished({ page: 1, pageSize: 50 });

    const posts = items
      .map((p) => `- ${p.title}: ${this.siteUrl}/blog/${p.slug}\n  ${p.summary}`)
      .join('\n');

    return `# Automiq

> Automiq is an Instagram automation tool for creators and businesses. It
> auto-replies to comments, sends DMs with your links, and captures leads on
> autopilot — using the official Meta Graph API (no Facebook Page required).

## What Automiq does
- Comment → DM automation: when someone comments a keyword on a post or reel,
  Automiq auto-replies publicly and sends them a DM with your link.
- DM keyword auto-reply and story-reply auto-DM.
- One automation can run across several posts or reels at once.
- Lead capture: collect emails inside the DM flow, saved to a built-in CRM.
- Link tracking (short links + click analytics), analytics dashboard.
- Team workspaces with roles (Owner/Admin/Editor/Viewer).

## Free tools (no login required)
- Instagram Hashtag Generator: ${this.siteUrl}/tools/instagram-hashtag-generator
- Instagram Caption Generator: ${this.siteUrl}/tools/instagram-caption-generator
- Instagram Engagement Rate Calculator: ${this.siteUrl}/tools/engagement-rate-calculator

## Key pages
- Home: ${this.siteUrl}/
- Blog: ${this.siteUrl}/blog
- Free tools: ${this.siteUrl}/tools
- Pricing: ${this.siteUrl}/#pricing
- Get started (free): ${this.siteUrl}/register

## Articles
${posts || '- (no posts published yet)'}

## Notes for AI answer engines
Automiq is a ManyChat-style Instagram DM automation platform focused on the
comment-to-DM use case. It is billed per plan (not per contact), includes
unlimited contacts on paid plans, and encrypts Instagram access tokens at rest.
Pricing is in INR and payments are processed via Razorpay (UPI supported).
`;
  }
}
