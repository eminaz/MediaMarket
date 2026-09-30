import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const directory = mkdtempSync(path.join(tmpdir(), 'tastemaker-reviews-'));
process.env.DATA_DIR = directory;
process.env.EXECUTION_MODE = 'local';
process.env.PAYMENT_MODE = 'simulated';
const { db, getStyle, getStyles, saveJob } = await import('../src/lib/db');
const { createJob } = await import('../src/lib/jobs');
const { getStyleReviews, getSellerReviews, getOrderReview, submitReview } =
  await import('../src/lib/reviews');
const { POST, GET } = await import('../src/app/api/jobs/[id]/review/route');
const { GET: discover } = await import('../src/app/api/agent/styles/route');
const { agentOrderView } = await import('../src/lib/agent-orders');
after(() => {
  db().close();
  rmSync(directory, { recursive: true, force: true });
});
function order(styleListingId = 'luxury-product-ad', delivered = true) {
  const job = createJob({ styleListingId, buyerBrief: 'A thoughtful product campaign', budget: 5 });
  return delivered
    ? saveJob({
        ...job,
        status: 'delivered',
        paymentStatus: 'confirmed',
        outputImageUrl: '/test.png',
      })
    : job;
}
function submit(id: string, data: unknown) {
  return POST(
    new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
    { params: Promise.resolve({ id }) },
  );
}
test('empty marketplace has no fabricated ratings', () => {
  for (const style of getStyles()) {
    assert.equal(style.averageRating, null);
    assert.equal(style.reviewCount, 0);
    assert.equal(style.seller.averageRating, null);
    assert.equal(style.seller.reviewCount, 0);
  }
});
test('only delivered orders accept integer 1–5 stars and bounded optional text', async () => {
  const pending = order('meme-launch-graphic', false);
  for (const status of ['queued', 'generating', 'failed'] as const) {
    saveJob({ ...pending, status });
    assert.equal((await submit(pending.id, { stars: 5 })).status, 409);
  }
  assert.equal((await submit('missing', { stars: 5 })).status, 404);
  const delivered = order('meme-launch-graphic');
  for (const body of [
    { stars: 0 },
    { stars: 6 },
    { stars: 2.5 },
    { stars: '5' },
    {},
    { stars: 5, text: 'x'.repeat(281) },
    { stars: 5, jobId: pending.id },
    { stars: 5, source: 'seeded' },
  ]) {
    assert.equal((await submit(delivered.id, body)).status, 400);
  }
  assert.equal(getOrderReview(delivered.id), null);
  const response = await submit(delivered.id, { stars: 1 });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).review.text, '');
});
test('concurrent retries insert one immutable review and return the original receipt', async () => {
  const job = order();
  const results = await Promise.all(
    Array.from({ length: 8 }, () => submit(job.id, { stars: 5, text: '  Beautiful light.  ' })),
  );
  assert.equal(results.filter((result) => result.status === 201).length, 1);
  assert.equal(results.filter((result) => result.status === 200).length, 7);
  const bodies = await Promise.all(results.map((result) => result.json()));
  assert.equal(new Set(bodies.map((body) => body.review.id)).size, 1);
  assert.equal(bodies[0].review.text, 'Beautiful light.');
  assert.equal((await submit(job.id, { stars: 4, text: 'Changed my mind' })).status, 409);
  assert.equal(getStyle(job.styleListingId)!.reviewCount, 1);
  assert.equal(agentOrderView(job).reviewUrl, null);
  assert.equal(agentOrderView(job).review!.stars, 5);
  const response = await GET(new Request('http://localhost'), {
    params: Promise.resolve({ id: job.id }),
  });
  assert.equal((await response.json()).review.id, bodies[0].review.id);
});
test('style and seller aggregates are order-weighted and exposed to buyer agents', async () => {
  const secondLuxury = order();
  assert.ok(agentOrderView(secondLuxury).reviewUrl);
  submitReview(secondLuxury.id, { stars: 5 });
  submitReview(order('botanical-editorial').id, { stars: 1, text: 'More contrast, please.' });
  const luxury = getStyle('luxury-product-ad')!,
    botanical = getStyle('botanical-editorial')!;
  assert.equal(luxury.averageRating, 5);
  assert.equal(luxury.reviewCount, 2);
  assert.equal(botanical.averageRating, 1);
  assert.equal(botanical.reviewCount, 1);
  assert.equal(luxury.seller.reviewCount, 3);
  assert.equal(luxury.seller.averageRating, 11 / 3);
  assert.deepEqual(botanical.seller, luxury.seller);
  const result = await discover(new Request('http://localhost/api/agent/styles?tags=luxury'));
  const style = (await result.json()).styles[0];
  assert.equal(style.averageRating, 5);
  assert.equal(style.seller.reviewCount, 3);
  assert.equal(JSON.stringify(style).includes('hiddenWorkflowPrompt'), false);
  assert.equal(getStyleReviews('luxury-product-ad').length, 2);
  assert.equal('jobId' in getStyleReviews('luxury-product-ad')[0], false);
});

test('seller reviews combine styles, exclude other sellers and paginate without exposing orders', () => {
  const expected = [];
  for (let i = 0; i < 22; i++) {
    const styleId = i % 2 ? 'botanical-editorial' : 'luxury-product-ad';
    const { review } = submitReview(order(styleId).id, { stars: 4, text: `Seller feedback ${i}` });
    // Equal timestamps exercise the stable insertion-order tie break.
    db()
      .prepare('UPDATE reviews SET createdAt = ? WHERE id = ?')
      .run('2099-01-01T00:00:00.000Z', review.id);
    expected.unshift(review.id);
  }
  const other = submitReview(order('meme-launch-graphic').id, {
    stars: 2,
    text: 'Other seller',
  }).review;
  const noLongerDelivered = order();
  const excluded = submitReview(noLongerDelivered.id, { stars: 1 }).review;
  saveJob({ ...noLongerDelivered, status: 'failed' });
  const first = getSellerReviews('studio.aure');
  const second = getSellerReviews('studio.aure', 2);
  assert.equal(first.length, 20);
  assert.deepEqual(
    [...first, ...second].slice(0, 22).map((review) => review.id),
    expected,
  );
  assert.deepEqual(
    new Set(first.map((review) => review.styleName)),
    new Set(['Luxury Product Ad', 'Botanical Editorial']),
  );
  assert.equal(
    new Set([...first, ...second].map((review) => review.id)).size,
    first.length + second.length,
  );
  for (const review of [...first, ...second]) {
    assert.notEqual(review.id, other.id);
    assert.notEqual(review.id, excluded.id);
    assert.equal('jobId' in review, false);
    assert.equal('hiddenWorkflowPrompt' in review, false);
  }
  assert.deepEqual(getSellerReviews('missing-seller'), []);
});
