/**
 * Client-side Instagram hashtag generator. No network / AI call — it expands the
 * user's keywords with proven modifier patterns and mixes in a curated set of
 * broad tags, then buckets the result by reach so users post a healthy mix of
 * big (discovery) and small (rankable) tags rather than only mega-tags.
 */

export type HashtagBucket = 'reach' | 'niche' | 'specific';

export interface HashtagGroup {
  bucket: HashtagBucket;
  label: string;
  hint: string;
  tags: string[];
}

export interface HashtagResult {
  groups: HashtagGroup[];
  all: string[];
}

// Broad, always-popular tags to seed the "reach" bucket.
const POPULAR = [
  'instagood',
  'instadaily',
  'photooftheday',
  'love',
  'viral',
  'trending',
  'explore',
  'explorepage',
  'reels',
  'instagram',
];

// Suffixes that reliably form real, searched hashtags from a keyword.
const NICHE_SUFFIXES = ['lover', 'life', 'community', 'tips', 'ideas', 'inspiration', 'daily'];
const SPECIFIC_SUFFIXES = ['oftheday', 'gram', 'addict', 'lifestyle', 'goals', 'obsessed', '101'];

function slug(word: string): string {
  return word
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]/g, '');
}

/** Splits free text into clean keyword tokens (dedup, drops tiny words). */
export function parseKeywords(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/[\s,#]+/)) {
    const s = slug(raw);
    if (s.length < 2 || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function take<T>(arr: T[], n: number): T[] {
  return arr.slice(0, Math.max(0, n));
}

function unique(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/**
 * @param input free-text keywords/topic
 * @param count total hashtags to aim for (Instagram allows up to 30)
 */
export function generateHashtags(input: string, count = 21): HashtagResult {
  const keywords = parseKeywords(input);
  if (keywords.length === 0) {
    return { groups: [], all: [] };
  }

  const per = Math.max(1, Math.round(count / 3));

  // Reach: the plain keywords + broad popular tags.
  const reach = unique([...keywords, ...POPULAR]).map((t) => `#${t}`);

  // Niche: keyword + medium-competition suffix.
  const niche: string[] = [];
  for (const k of keywords) {
    for (const s of NICHE_SUFFIXES) niche.push(`#${k}${s}`);
  }

  // Specific: long-tail combinations — lower volume, easier to rank.
  const specific: string[] = [];
  for (const k of keywords) {
    for (const s of SPECIFIC_SUFFIXES) specific.push(`#${k}${s}`);
  }
  // Pair the first two keywords for an extra long-tail tag.
  if (keywords.length >= 2) specific.push(`#${keywords[0]}${keywords[1]}`);

  const groups: HashtagGroup[] = [
    {
      bucket: 'reach',
      label: 'Broad reach',
      hint: 'High volume — quick discovery, lots of competition',
      tags: take(unique(reach), per),
    },
    {
      bucket: 'niche',
      label: 'Niche',
      hint: 'Medium volume — your target audience lives here',
      tags: take(unique(niche), per),
    },
    {
      bucket: 'specific',
      label: 'Specific / long-tail',
      hint: 'Low volume — easiest to rank and stay visible',
      tags: take(unique(specific), count - per * 2),
    },
  ];

  return { groups, all: unique(groups.flatMap((g) => g.tags)) };
}
