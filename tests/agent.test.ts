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
