import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { transaction, expected, seller } from './fixtures/payment';
import { defaultPayoutAddress } from '../src/lib/payout';

const directory = mkdtempSync(path.join(tmpdir(), 'tastemaker-proof-'));
process.env.DATA_DIR = directory;
process.env.PAYMENT_MODE = 'pay-sandbox';
process.env.EXECUTION_MODE = 'worker';
process.env.SELLER_WORKER_TOKENS = JSON.stringify({ 'studio.aure': 'sandbox-worker-secret' });
process.env.SELLER_PAYOUT_ADDRESSES = JSON.stringify({ offgrid: defaultPayoutAddress('override') });
const { db, getStyle, getJob, getPrivateStyle, saveStyle, saveJob } = await import('../src/lib/db');
const { createJob } = await import('../src/lib/jobs');
const { verifySavedPayment } = await import('../src/lib/payment-verification');
const { claimNextJob, finishWorkerJob } = await import('../src/lib/workers');
const { POST: pay } = await import('../src/app/api/jobs/[id]/pay/route');
const { POST: advance } = await import('../src/app/api/jobs/[id]/advance/route');
after(() => {
  db().close();
  rmSync(directory, { recursive: true, force: true });
});

test('seller payout configuration is shared by styles and frozen on orders', () => {
  assert.equal(getStyle('streetwear-hype')!.seller.payoutAddress, defaultPayoutAddress('override'));
  const job = createJob({
    styleListingId: 'luxury-product-ad',
    buyerBrief: 'A luxury campaign',
    budget: 5,
  });
  const custom = defaultPayoutAddress('custom');
  const style = { ...getPrivateStyle('luxury-product-ad')!, id: 'new-style' };
  saveStyle(style, custom);
  assert.equal(getStyle('luxury-product-ad')!.seller.payoutAddress, custom);
  assert.equal(getStyle('botanical-editorial')!.seller.payoutAddress, custom);
  assert.equal(getJob(job.id)!.payoutAddress, seller);
  saveStyle({ ...style, id: 'restore-style' }, seller);
});
test('accepted receipt waits for chain verification; retry reuses it and claims only once', async () => {
  const job = createJob({
    styleListingId: 'luxury-product-ad',
    buyerBrief: 'A luxury campaign',
    budget: 5,
  });
  const receipt = {
    protocol: 'mpp' as const,
    network: 'pay-sandbox' as const,
    transaction: expected.signature,
    payer: null,
    recipient: seller,
    amountUsdc: 2.5,
    confirmedAt: new Date().toISOString(),
  };
  saveJob({ ...job, paymentReceipt: receipt });
  assert.equal(claimNextJob('studio.aure', 'Test seller'), null);
  // A legacy/partial confirmed flag alone cannot authorize generation.
  saveJob({ ...getJob(job.id)!, paymentStatus: 'confirmed' });
  assert.equal(claimNextJob('studio.aure', 'Test seller'), null);
  const request = new Request('http://localhost'),
    context = { params: Promise.resolve({ id: job.id }) };
  assert.equal((await advance(request, context)).status, 409);
  await assert.rejects(
    verifySavedPayment(job.id, async () => null),
    /not available/,
  );
  assert.equal(getJob(job.id)!.paymentStatus, 'pending');
  assert.equal(getJob(job.id)!.paymentReceipt!.transaction, receipt.transaction);
  assert.equal(claimNextJob('studio.aure', 'Test seller'), null);
  const wrong = transaction(job.id);
  wrong.meta.postTokenBalances[1].uiTokenAmount.amount = '5600000';
  await assert.rejects(
    verifySavedPayment(job.id, async () => wrong),
    /Seller USDC delta/,
  );
  assert.equal(claimNextJob('studio.aure', 'Test seller'), null);
  const originalFetch = globalThis.fetch;
  let rpcCalls = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://402.surfnet.dev:8899');
    const rpc = JSON.parse(String(init?.body));
    assert.equal(rpc.method, 'getTransaction'); // No new challenge, funding or payment broadcast.
    assert.equal(rpc.params[0], receipt.transaction);
    rpcCalls++;
    return Response.json({ result: transaction(job.id) });
  };
  try {
    assert.equal((await pay(request, context)).status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(rpcCalls, 1);
  const verified = getJob(job.id)!;
  assert.equal(verified.paymentStatus, 'confirmed');
  assert.equal(verified.paymentVerificationError, null);
  const assignment = claimNextJob('studio.aure', 'Test seller')!;
  assert.equal(assignment.job.id, job.id);
  assert.ok(assignment.job.workerClaimedAt! >= verified.paymentReceipt!.evidence!.verifiedAt);
  assert.equal(claimNextJob('studio.aure', 'Test seller'), null);
  finishWorkerJob('studio.aure', job.id, assignment.claimToken, '/output.png');
  const delivered = getJob(job.id)!;
  // A confirmed retry must not fetch RPC, call Pay, modify the receipt or start generation again.
  assert.deepEqual(
    await verifySavedPayment(job.id, async () => {
      throw new Error('Must not fetch');
    }),
    delivered,
  );
  assert.deepEqual(await (await pay(request, context)).json(), delivered);
  assert.equal(claimNextJob('studio.aure', 'Test seller'), null);
  assert.deepEqual(getJob(job.id), delivered);
});
