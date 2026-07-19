import type { TriggerMatchType } from '@prisma/client';

/**
 * Case-insensitive keyword matching for comment triggers. Pure function, no I/O.
 * Mirrors growasy-api's matcher so the CRUD side and the execution side agree on
 * what "matches" means.
 *
 * - ANY: any non-empty comment (no keywords needed)
 * - EXACT: the whole comment equals a keyword
 * - STARTS_WITH: the comment starts with a keyword
 * - CONTAINS: a keyword appears anywhere in the comment
 * - REGEX: each keyword is treated as a regular expression
 */
export function matchesKeywords(
  text: string,
  matchType: TriggerMatchType,
  keywords: string[],
): boolean {
  const normalized = text.trim().toLowerCase();

  if (matchType === 'ANY') {
    return normalized.length > 0;
  }
  if (!keywords || keywords.length === 0) {
    return false;
  }

  return keywords.some((rawKeyword) => {
    const keyword = rawKeyword.trim().toLowerCase();
    if (!keyword) return false;

    switch (matchType) {
      case 'EXACT':
        return normalized === keyword;
      case 'STARTS_WITH':
        return normalized.startsWith(keyword);
      case 'CONTAINS':
        return normalized.includes(keyword);
      case 'REGEX':
        try {
          return new RegExp(rawKeyword, 'i').test(text);
        } catch {
          return false;
        }
      default:
        return false;
    }
  });
}
