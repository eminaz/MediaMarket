import type { MediaType, StyleListing } from './types';
import { ratingScore } from './ratings';
export function pickStyle(
  styles: StyleListing[],
  budget: number,
  requested: string[],
  type: MediaType = 'image',
) {
  const tags = [...new Set(requested.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  const ranked = styles
    .filter((s) => s.type === type && s.priceUsdc <= budget)
    .map((style) => ({
      style,
      matches: tags.filter((t) => style.tags.some((s) => s.toLowerCase() === t)),
    }))
    .sort(
      (a, b) =>
        b.matches.length - a.matches.length ||
        ratingScore(b.style) - ratingScore(a.style) ||
        a.style.etaSeconds - b.style.etaSeconds ||
        a.style.priceUsdc - b.style.priceUsdc ||
        a.style.id.localeCompare(b.style.id),
    );
  if (!ranked.length) return null;
  const { style, matches } = ranked[0];
  const reputation =
    style.reviewCount && style.averageRating !== null
      ? `${style.averageRating.toFixed(1)} stars across ${style.reviewCount} completed-order review${style.reviewCount === 1 ? '' : 's'}.`
      : 'No reviews yet.';
  return {
    style,
    reason: matches.length
      ? `Matched ${matches.map((t) => `“${t}”`).join(' and ')} at ${style.priceUsdc.toFixed(2)} USDC, within your ${budget.toFixed(2)} USDC budget. ${reputation} Review count tempers ratings; ETA and price break remaining ties.`
      : `No exact vibe match, so I ranked styles within your ${budget.toFixed(2)} USDC budget by review-adjusted rating, then ETA and price. ${reputation} ${style.etaSeconds}s delivery.`,
  };
}
