import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const directory = mkdtempSync(path.join(tmpdir(), 'tastemaker-agent-'));
process.env.DATA_DIR = directory;
process.env.EXECUTION_MODE = 'worker';
process.env.PAYMENT_MODE = 'simulated';
process.env.SELLER_WORKER_TOKENS = JSON.stringify({ 'studio.aure': 'test-seller-token-1234' });
const { db, getJobs, getJob, getPrivateStyle, saveJob } = await import('../src/lib/db');
const { POST: order } = await import('../src/app/api/agent/orders/route');
const { GET: status } = await import('../src/app/api/agent/orders/[id]/route');
const { GET: discover } = await import('../src/app/api/agent/styles/route');
const { createJob } = await import('../src/lib/jobs');
const { inferTags } = await import('../src/lib/agent-orders');
const input = {
  prompt: 'A luxury skincare bottle in soft morning light',
  budget: 5,
  payment: 'simulated',
};
const submit = (key: string | null, body: unknown = input) =>
  order(
    new Request('http://localhost/api/agent/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
      body: JSON.stringify(body),
    }),
  );
after(() => {
  db().close();
  rmSync(directory, { recursive: true, force: true });
});

test('agent discovers only eligible public styles with budget and tag filtering', async () => {
  const response = await discover(
    new Request('http://localhost/api/agent/styles?budget=2.5&tags=luxury'),
  );
  const body = await response.json();
  assert.deepEqual(
    body.styles.map((style: { id: string }) => style.id),
    ['luxury-product-ad'],
  );
  assert.equal(JSON.stringify(body).includes('hiddenWorkflowPrompt'), false);
  assert.match(body.availabilityNote, /offline/);
  assert.equal(
    (await discover(new Request('http://localhost/api/agent/styles?budget=NaN'))).status,
    400,
  );
});

test('agent orders infer tags, respect budget, pay simulated USDC, and expose no recipe', async () => {
  const response = await submit('test-auto-order');
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.style.id, 'luxury-product-ad');
  assert.deepEqual(body.desiredTags, ['luxury']);
  assert.equal(body.payment.mode, 'simulated');
  assert.equal(body.payment.status, 'confirmed');
  assert.equal(body.payment.amountUsdc, 2.5);
  assert.equal(body.advanceUrl, null);
  assert.equal(body.status, 'queued');
  assert.equal(body.outputImageUrl, null);
  assert.equal(getJob(body.jobId)?.requestSource, 'agent');
  const publicJob = await status(new Request('http://localhost'), {
    params: Promise.resolve({ id: body.jobId }),
  });
  const text = await publicJob.text();
  assert.equal(text.includes('hiddenWorkflowPrompt'), false);
  assert.equal(text.includes(getPrivateStyle(body.style.id)!.hiddenWorkflowPrompt), false);
  assert.equal(text.includes('claimToken'), false);
});

test('concurrent retries create exactly one order; conflicting reuse returns 409', async () => {
  const before = getJobs().length;
  const responses = await Promise.all(
    Array.from({ length: 5 }, () => submit('concurrent-agent-order')),
  );
  const bodies = await Promise.all(responses.map((response) => response.json()));
  assert.equal(new Set(bodies.map((body) => body.jobId)).size, 1);
  assert.equal(responses.filter((response) => response.status === 201).length, 1);
  assert.equal(getJobs().length, before + 1);
  assert.equal(
    (await submit('concurrent-agent-order', { ...input, prompt: 'A different subject' })).status,
    409,
  );
  // Idempotency still returns the original order if seller configuration changes.
  process.env.SELLER_WORKER_TOKENS = '{}';
  try {
    assert.equal((await submit('concurrent-agent-order')).status, 200);
  } finally {
    process.env.SELLER_WORKER_TOKENS = JSON.stringify({ 'studio.aure': 'test-seller-token-1234' });
  }
});

test('invalid payments, low budgets, missing keys, and unavailable sellers create no jobs', async () => {
  const before = getJobs().length;
  assert.equal((await submit(null)).status, 400);
  assert.equal((await submit('invalid-payment', { ...input, payment: 'real' })).status, 400);
  assert.equal((await submit('no-payment-mode', { prompt: input.prompt, budget: 5 })).status, 400);
  assert.equal((await submit('under-budget-auto', { ...input, budget: 0.1 })).status, 422);
  assert.equal(
    (
      await submit('under-budget-pick', {
        ...input,
        budget: 1,
        styleListingId: 'luxury-product-ad',
      })
    ).status,
    400,
  );
  assert.equal(
    (await submit('offline-seller-pick', { ...input, styleListingId: 'meme-launch-graphic' }))
      .status,
    422,
  );
  assert.equal(getJobs().length, before);
});

test('external agents can choose a style; status provides download and retry links', async () => {
  const response = await submit('manual-agent-order', {
    ...input,
    styleListingId: 'botanical-editorial',
  });
  const body = await response.json();
  assert.equal(body.style.id, 'botanical-editorial');
  assert.match(body.decisionReason, /external agent/);
  const saved = getJob(body.jobId)!;
  saveJob({ ...saved, status: 'failed', error: 'Worker interrupted' });
  let current = await (
    await status(new Request('http://localhost'), { params: Promise.resolve({ id: saved.id }) })
  ).json();
  assert.equal(current.retryUrl, `/api/jobs/${saved.id}/retry`);
  assert.equal(current.pollAfterMs, null);
  saveJob({
    ...saved,
    status: 'delivered',
    outputImageUrl: '/api/media/result.png',
    generationMode: 'local',
  });
  current = await (
    await submit('manual-agent-order', { ...input, styleListingId: 'botanical-editorial' })
  ).json();
  assert.equal(current.downloadUrl, '/api/media/result.png?download=1');
  assert.equal(current.generationMode, 'local');
  assert.equal(current.replayed, true);
  assert.equal(
    (await status(new Request('http://localhost'), { params: Promise.resolve({ id: 'missing' }) }))
      .status,
    404,
  );
});

test('shared web order creation still requires checkout; keyword inference uses whole words', () => {
  const job = createJob({
    styleListingId: 'luxury-product-ad',
    buyerBrief: input.prompt,
    budget: 5,
  });
  assert.equal(job.paymentStatus, 'pending');
  assert.equal(job.requestSource, 'web');
  assert.deepEqual(
    inferTags('A premium botanical scene', [
      getPrivateStyle('luxury-product-ad')!,
      getPrivateStyle('botanical-editorial')!,
    ]),
    ['luxury', 'organic'],
  );
  assert.deepEqual(
    inferTags('Unboldened luxuryless text', [getPrivateStyle('luxury-product-ad')!]),
    [],
  );
});

test('sandbox mode cannot be bypassed with simulated checkout and freezes payment mode per order', async () => {
  process.env.PAYMENT_MODE = 'pay-sandbox';
  try {
    const count = getJobs().length;
    assert.equal((await submit('sandbox-bypass-attempt')).status, 400);
    assert.equal(getJobs().length, count);
    const response = await submit('sandbox-pending-order', { ...input, payment: 'pay-sandbox' });
    const body = await response.json();
    assert.equal(body.payment.mode, 'pay-sandbox');
    assert.equal(body.payment.status, 'pending');
    assert.equal(body.payment.receipt, null);
    assert.equal(body.paymentUrl, `/api/jobs/${body.jobId}/pay`);
    assert.equal(getJob(body.jobId)?.paymentConfirmedAt, null);
    process.env.PAYMENT_MODE = 'simulated';
    const saved = await (
      await status(new Request('http://localhost'), { params: Promise.resolve({ id: body.jobId }) })
    ).json();
    assert.equal(saved.payment.mode, 'pay-sandbox');
  } finally {
    process.env.PAYMENT_MODE = 'simulated';
  }
});
