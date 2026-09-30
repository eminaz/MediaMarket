import test from 'node:test';
import assert from 'node:assert/strict';
import { pickStyle } from '../src/lib/agent';
import { seeds } from '../src/lib/seed';
import type { StyleListing } from '../src/lib/types';
const styles = seeds.map((seed) => ({ ...seed, type: 'image' })) as unknown as StyleListing[];
test('agent prioritizes matching taste while respecting a hard budget', () => {
  assert.equal(pickStyle(styles, 5, ['luxury', 'minimal'])?.style.id, 'luxury-product-ad');
  assert.equal(pickStyle(styles, 2, ['luxury', 'minimal'])?.style.id, 'botanical-editorial');
  assert.equal(pickStyle(styles, 0.5, ['luxury']), null);
});
test('agent breaks equal tag scores by ETA and explains a no-match fallback', () => {
  assert.equal(pickStyle(styles, 5, ['cinematic', 'pastel'])?.style.id, 'cute-pastel-promo');
  const fallback = pickStyle(styles, 5, ['unknown']);
  assert.equal(fallback?.style.id, 'meme-launch-graphic');
  assert.match(fallback!.reason, /No exact vibe match/);
});
test('tag normalization and duplicate tags cannot distort ranking', () => {
  assert.equal(
    pickStyle(styles, 5, [' LUXURY ', 'luxury', 'cute', 'pastel'])?.style.id,
    'cute-pastel-promo',
  );
  assert.equal(pickStyle([{ ...styles[0], type: 'video' }], 10, ['luxury']), null);
});

test('credible reviews outrank a single perfect review after budget and taste match', () => {
  const single = {
    ...styles[0],
    id: 'single',
    averageRating: 5,
    reviewCount: 1,
    etaSeconds: 5,
    priceUsdc: 1,
  };
  const established = {
    ...styles[0],
    id: 'established',
    averageRating: 4.8,
    reviewCount: 30,
    etaSeconds: 60,
    priceUsdc: 2.5,
  };
  assert.equal(pickStyle([single, established], 5, ['luxury'])?.style.id, 'established');
  assert.equal(pickStyle([single, established], 2, ['luxury'])?.style.id, 'single');
  const differentVibe = { ...established, tags: ['meme'] };
  assert.equal(pickStyle([single, differentVibe], 5, ['luxury'])?.style.id, 'single');
  assert.match(pickStyle([single, established], 5, ['luxury'])!.reason, /4.8 stars across 30/);
});
test('unrated styles stay neutral, with ETA and price breaking equal rating scores', () => {
  const base = { ...styles[0], averageRating: null, reviewCount: 0 };
  const poor = { ...base, id: 'poor', averageRating: 1, reviewCount: 30, etaSeconds: 5 };
  assert.equal(pickStyle([base, poor], 5, [])?.style.id, base.id);
  const cheap = { ...base, id: 'cheap', priceUsdc: 1 };
  assert.equal(pickStyle([base, cheap], 5, [])?.style.id, 'cheap');
  const fast = { ...base, id: 'fast', etaSeconds: 5 };
  assert.equal(pickStyle([base, cheap, fast], 5, [])?.style.id, 'fast');
});
