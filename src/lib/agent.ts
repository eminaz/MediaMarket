import type { StyleListing } from './types';
export function pickStyle(styles: StyleListing[], budget: number, requested: string[]) {
  const tags = [...new Set(requested.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  const ranked = styles
    .filter((s) => s.type === 'image' && s.priceUsdc <= budget)
    .map((style) => ({
      style,
      matches: tags.filter((t) => style.tags.some((s) => s.toLowerCase() === t)),
    }))
    .sort(
      (a, b) =>
        b.matches.length - a.matches.length ||
        a.style.etaSeconds - b.style.etaSeconds ||
        a.style.priceUsdc - b.style.priceUsdc ||
        a.style.id.localeCompare(b.style.id),
    );
  if (!ranked.length) return null;
  const { style, matches } = ranked[0];
  return {
    style,
    reason: matches.length
      ? `Matched ${matches.map((t) => `“${t}”`).join(' and ')} at ${style.priceUsdc.toFixed(2)} USDC, within your ${budget.toFixed(2)} USDC budget. Faster delivery breaks ties.`
      : `No exact vibe match, so I picked the fastest style within your ${budget.toFixed(2)} USDC budget: ${style.etaSeconds}s delivery.`,
  };
}
