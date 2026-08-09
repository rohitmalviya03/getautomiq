/**
 * Parses a Markdown file with front matter into blog-post fields.
 *
 * Front matter is the `---` fenced block at the top of the file, the same
 * convention Jekyll, Hugo and Next.js use — so a writer can draft in any editor
 * and the file stays readable on its own.
 *
 * Kept deliberately to `key: value` rather than pulling in a YAML parser: the
 * fields are flat, and a full YAML engine would accept a lot of syntax the
 * importer would then have to reject anyway.
 */

export interface ParsedPost {
  title?: string;
  summary?: string;
  content: string;
  slug?: string;
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  coverImageUrl?: string;
  coverImageAlt?: string;
  tags?: string[];
  seoTitle?: string;
  seoDescription?: string;
}

export interface ImportResult {
  post: ParsedPost;
  /** Non-fatal notes — unknown keys, a missing title, etc. Shown to the author. */
  warnings: string[];
}

const KNOWN_KEYS = new Set([
  'title',
  'summary',
  'description',
  'slug',
  'status',
  'cover',
  'coverimage',
  'coverimageurl',
  'coveralt',
  'coverimagealt',
  'tags',
  'seotitle',
  'seodescription',
]);

/** Strips matching wrapping quotes, which writers add out of habit. */
function unquote(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    return v.slice(1, -1);
  }
  return v;
}

function parseTags(raw: string): string[] {
  const value = unquote(raw);
  // Accept both `tags: [a, b]` and `tags: a, b`.
  const inner = value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value;
  return inner
    .split(',')
    .map((t) => unquote(t).trim())
    .filter(Boolean)
    .slice(0, 8);
}

export function parseMarkdownFile(raw: string): ImportResult {
  const warnings: string[] = [];
  const text = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n'); // strip BOM + CRLF

  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  const body = match ? text.slice(match[0].length) : text;
  const post: ParsedPost = { content: body.trim() };

  if (!match) {
    warnings.push('No front matter found — only the body was imported.');
  } else {
    for (const line of match[1].split('\n')) {
      if (!line.trim() || line.trimStart().startsWith('#')) continue;
      const sep = line.indexOf(':');
      if (sep === -1) continue;

      const key = line.slice(0, sep).trim().toLowerCase().replace(/[_-]/g, '');
      const value = unquote(line.slice(sep + 1));
      if (!value) continue;

      if (!KNOWN_KEYS.has(key)) {
        warnings.push(`Ignored unknown field "${line.slice(0, sep).trim()}".`);
        continue;
      }

      switch (key) {
        case 'title':
          post.title = value;
          break;
        case 'summary':
        case 'description':
          post.summary = value;
          break;
        case 'slug':
          post.slug = value.toLowerCase();
          break;
        case 'status': {
          const status = value.toUpperCase();
          if (status === 'DRAFT' || status === 'PUBLISHED' || status === 'ARCHIVED') {
            post.status = status;
          } else {
            warnings.push(`Unknown status "${value}" — importing as a draft.`);
          }
          break;
        }
        case 'cover':
        case 'coverimage':
        case 'coverimageurl':
          post.coverImageUrl = value;
          break;
        case 'coveralt':
        case 'coverimagealt':
          post.coverImageAlt = value;
          break;
        case 'tags':
          post.tags = parseTags(value);
          break;
        case 'seotitle':
          post.seoTitle = value;
          break;
        case 'seodescription':
          post.seoDescription = value;
          break;
      }
    }
  }

  // Fall back to the first H1 so a file that only has a heading still imports.
  if (!post.title) {
    const h1 = /^#\s+(.+)$/m.exec(post.content);
    if (h1) {
      post.title = h1[1].trim();
      post.content = post.content.replace(h1[0], '').trim();
      warnings.push('No title field — used the first heading instead.');
    } else {
      warnings.push('No title found. Add one before saving.');
    }
  }

  if (!post.summary) {
    warnings.push('No summary found. Add one — it becomes the meta description.');
  }
  if (post.coverImageUrl && !post.coverImageAlt) {
    warnings.push('Cover image has no alt text. Add one before saving.');
  }
  if (!post.content) {
    warnings.push('The file has no body content.');
  }

  return { post, warnings };
}

/** The template offered as a download, so the expected shape is never guesswork. */
export const IMPORT_TEMPLATE = `---
title: How to turn Instagram comments into customers
summary: A practical walkthrough of setting up your first comment-to-DM automation, from keyword to captured lead.
tags: automation, instagram, growth
cover: https://example.com/cover.jpg
coverAlt: A phone showing an Instagram comment thread
status: DRAFT
# Optional — generated from the title when blank:
# slug: comment-to-dm-guide
# seoTitle: Comment to DM automation guide
# seoDescription: Set up Instagram comment-to-DM automation in minutes.
---

## Why comments are your best lead source

Someone who comments has already raised their hand. Write the body in Markdown —
**bold**, *italic*, [links](https://app.getautomiq.in), lists and images all work.

- Reply publicly so the algorithm sees engagement
- Send the link privately in a DM
- Capture the email inside the same conversation

## Setting it up

1. Connect your Instagram account
2. Pick the post or reel
3. Choose your keyword

> Tip: keep the keyword short and easy to spell.
`;
