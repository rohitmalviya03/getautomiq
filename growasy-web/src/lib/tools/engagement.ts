/**
 * Instagram engagement-rate calculator. ER by followers is the standard public
 * metric: (avg likes + avg comments) / followers × 100. Benchmarks below are the
 * commonly cited industry bands for Instagram.
 */

export type EngagementRating = 'low' | 'average' | 'good' | 'excellent';

export interface EngagementInput {
  followers: number;
  avgLikes: number;
  avgComments: number;
}

export interface EngagementResult {
  rate: number; // percentage, e.g. 3.42
  rating: EngagementRating;
  label: string;
  summary: string;
  interactionsPerPost: number;
}

const RATING_META: Record<EngagementRating, { label: string; summary: string }> = {
  low: {
    label: 'Below average',
    summary: 'Under ~1%. Try stronger hooks, more Reels, and clear calls-to-action to lift interactions.',
  },
  average: {
    label: 'Average',
    summary: 'Around 1–3% is typical for most accounts. Solid, with room to grow through consistency.',
  },
  good: {
    label: 'Good',
    summary: '3–6% is strong — your audience is genuinely engaged. Keep doing what works.',
  },
  excellent: {
    label: 'Excellent',
    summary: 'Above ~6% is exceptional, usually seen on smaller, highly-loyal audiences.',
  },
};

function ratingFor(rate: number): EngagementRating {
  if (rate < 1) return 'low';
  if (rate < 3) return 'average';
  if (rate < 6) return 'good';
  return 'excellent';
}

/** Returns null when followers is not a positive number (can't divide by it). */
export function computeEngagement(input: EngagementInput): EngagementResult | null {
  const followers = Number(input.followers);
  const likes = Math.max(0, Number(input.avgLikes) || 0);
  const comments = Math.max(0, Number(input.avgComments) || 0);
  if (!Number.isFinite(followers) || followers <= 0) return null;

  const interactions = likes + comments;
  const rate = (interactions / followers) * 100;
  const rating = ratingFor(rate);

  return {
    rate: Math.round(rate * 100) / 100,
    rating,
    label: RATING_META[rating].label,
    summary: RATING_META[rating].summary,
    interactionsPerPost: interactions,
  };
}
