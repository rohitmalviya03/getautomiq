import { useEffect } from 'react';

const DEFAULT_TITLE = 'Automiq — Instagram Automation Tool (Comment → DM, Auto-Reply)';

/**
 * Lightweight SEO for the SPA: per-page title, meta description, canonical,
 * Open Graph / Twitter tags, and optional JSON-LD structured data (FAQPage,
 * BreadcrumbList, etc. — what Google rich results and AI answer engines parse).
 * Cleans up injected JSON-LD on unmount. Pair with build-time prerendering for
 * guaranteed crawler coverage.
 */
export function useSeo(
  title: string,
  description?: string,
  jsonLd?: Record<string, unknown> | Record<string, unknown>[],
) {
  // Stable key so a fresh jsonLd object each render doesn't re-run the effect.
  const jsonLdKey = jsonLd ? JSON.stringify(jsonLd) : '';

  useEffect(() => {
    document.title = title;
    const url = window.location.origin + window.location.pathname;

    if (description) {
      setMeta('name', 'description', description);
      setMeta('property', 'og:description', description);
      setMeta('name', 'twitter:description', description);
    }
    setMeta('property', 'og:title', title);
    setMeta('name', 'twitter:title', title);
    setMeta('property', 'og:url', url);
    setCanonical(url);

    const blocks = jsonLdKey ? (JSON.parse(jsonLdKey) as Record<string, unknown>[] | Record<string, unknown>) : [];
    const blockList = Array.isArray(blocks) ? blocks : [blocks];
    const scripts = blockList.map((block) => {
      const s = document.createElement('script');
      s.type = 'application/ld+json';
      s.setAttribute('data-seo', 'page');
      s.textContent = JSON.stringify(block);
      document.head.appendChild(s);
      return s;
    });

    return () => {
      document.title = DEFAULT_TITLE;
      scripts.forEach((s) => s.remove());
    };
  }, [title, description, jsonLdKey]);
}

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/** Builds a Schema.org FAQPage block from a list of Q&A pairs. */
export function faqJsonLd(faqs: { q: string; a: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

/** Builds a Schema.org BreadcrumbList from ordered {name, url} items. */
export function breadcrumbJsonLd(items: { name: string; url: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}
