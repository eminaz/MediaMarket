import type { RatingSummary } from './types';

export const unrated: RatingSummary = { averageRating: null, reviewCount: 0 };
// Ten neutral (3-star) observations temper small samples. These are a ranking prior only,
// never stored reviews or displayed stars. Budget and taste always take precedence.
export function ratingScore(rating: RatingSummary) {
  const count = rating.reviewCount || 0;
  return ((rating.averageRating ?? 3) * count + 30) / (count + 10);
}
