import { describe, expect, it } from 'vitest';
import { IMPORT_TEMPLATE, parseMarkdownFile } from '@/lib/blog-import';

const FULL = `---
title: Comment to DM guide
summary: How to turn Instagram comments into captured leads.
tags: automation, instagram, growth
cover: https://example.com/c.jpg
coverAlt: A phone showing comments
status: PUBLISHED
slug: comment-to-dm-guide
seoTitle: The comment-to-DM guide
seoDescription: Set it up in minutes.
---

## Why it works

People who comment are **already interested**.
`;

describe('parseMarkdownFile', () => {
  it('reads every front-matter field', () => {
    const { post, warnings } = parseMarkdownFile(FULL);

    expect(post.title).toBe('Comment to DM guide');
    expect(post.summary).toBe('How to turn Instagram comments into captured leads.');
    expect(post.tags).toEqual(['automation', 'instagram', 'growth']);
    expect(post.coverImageUrl).toBe('https://example.com/c.jpg');
    expect(post.coverImageAlt).toBe('A phone showing comments');
    expect(post.status).toBe('PUBLISHED');
    expect(post.slug).toBe('comment-to-dm-guide');
    expect(post.seoTitle).toBe('The comment-to-DM guide');
    expect(post.seoDescription).toBe('Set it up in minutes.');
    expect(post.content).toContain('## Why it works');
    expect(post.content).not.toContain('---');
    expect(warnings).toHaveLength(0);
  });

  it('accepts the shipped template without complaint', () => {
    const { post, warnings } = parseMarkdownFile(IMPORT_TEMPLATE);
    expect(post.title).toBeTruthy();
    expect(post.summary).toBeTruthy();
    expect(warnings).toHaveLength(0);
  });

  it('accepts tags as a bracketed list', () => {
    const { post } = parseMarkdownFile('---\ntitle: T\nsummary: S\ntags: [a, b]\n---\nbody');
    expect(post.tags).toEqual(['a', 'b']);
  });

  it('strips quotes writers add out of habit', () => {
    const { post } = parseMarkdownFile('---\ntitle: "Quoted"\nsummary: \'Also quoted\'\n---\nbody');
    expect(post.title).toBe('Quoted');
    expect(post.summary).toBe('Also quoted');
  });

  it('tolerates CRLF line endings and a BOM', () => {
    const { post } = parseMarkdownFile('﻿---\r\ntitle: T\r\nsummary: S\r\n---\r\nbody here');
    expect(post.title).toBe('T');
    expect(post.content).toBe('body here');
  });

  // A file with no front matter should still import rather than being rejected.
  it('falls back to the first heading when there is no title field', () => {
    const { post, warnings } = parseMarkdownFile('# My heading\n\nSome body.');
    expect(post.title).toBe('My heading');
    expect(post.content).toBe('Some body.');
    expect(warnings.join(' ')).toContain('first heading');
  });

  it('warns instead of failing when required fields are missing', () => {
    const { warnings } = parseMarkdownFile('just a body with no metadata at all');
    expect(warnings.join(' ')).toContain('No title');
    expect(warnings.join(' ')).toContain('No summary');
  });

  it('warns about a cover image with no alt text', () => {
    const { warnings } = parseMarkdownFile(
      '---\ntitle: T\nsummary: S\ncover: https://x.com/a.jpg\n---\nbody',
    );
    expect(warnings.join(' ')).toContain('alt text');
  });

  it('rejects an unknown status rather than trusting it', () => {
    const { post, warnings } = parseMarkdownFile('---\ntitle: T\nsummary: S\nstatus: LIVE\n---\nb');
    expect(post.status).toBeUndefined();
    expect(warnings.join(' ')).toContain('Unknown status');
  });

  it('reports unknown fields instead of silently dropping them', () => {
    const { warnings } = parseMarkdownFile('---\ntitle: T\nsummary: S\nauthor: Me\n---\nbody');
    expect(warnings.join(' ')).toContain('author');
  });

  it('caps tags so a runaway list cannot be submitted', () => {
    const tags = Array.from({ length: 20 }, (_, i) => `t${i}`).join(', ');
    const { post } = parseMarkdownFile(`---\ntitle: T\nsummary: S\ntags: ${tags}\n---\nb`);
    expect(post.tags).toHaveLength(8);
  });
});
