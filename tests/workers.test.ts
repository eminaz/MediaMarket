import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { GenerationJob } from '../src/lib/types';

const directory = mkdtempSync(path.join(tmpdir(), 'tastemaker-worker-'));
process.env.DATA_DIR = directory;
process.env.SELLER_WORKER_TOKENS = JSON.stringify({
  'studio.aure': 'test-studio-token-1234',
  offgrid: 'test-offgrid-token-1234',
});
const { db, getJob, saveJob } = await import('../src/lib/db');
const { authenticateWorker, claimNextJob, heartbeat, requireClaim, finishWorkerJob } =
  await import('../src/lib/workers');
const { POST: advance } = await import('../src/app/api/jobs/[id]/advance/route');
const { GET: publicJob } = await import('../src/app/api/jobs/[id]/route');
function job(overrides: Partial<GenerationJob> = {}) {
  const now = new Date().toISOString();
  return saveJob({
    id: randomUUID(),
    styleListingId: 'luxury-product-ad',
    inputImageUrl: '/samples/demo-product.png',
    buyerBrief: 'A luxury skincare campaign.',
    brandName: 'AURA',
    budget: 5,
    desiredTags: ['luxury'],
    status: 'queued',
    selectedByAgent: false,
    decisionReason: 'Handpicked',
    paymentStatus: 'confirmed',
    paymentConfirmedAt: now,
    priceUsdc: 2.5,
    outputImageUrl: null,
    generationMode: null,
    executionMode: 'worker',
    error: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}
after(() => {
  db().close();
  rmSync(directory, { recursive: true, force: true });
});

test('worker credentials are seller-scoped and fail closed', () => {
  assert.throws(() => authenticateWorker(new Request('http://localhost')), /credentials/);
  const request = (handle: string) =>
    new Request('http://localhost', {
      headers: { authorization: 'Bearer test-studio-token-1234', 'x-seller-handle': handle },
    });
  assert.equal(authenticateWorker(request('studio.aure')), 'studio.aure');
  assert.throws(() => authenticateWorker(request('offgrid')), /credentials/);
});
test('only paid remote jobs for the matching seller are claimed once', async () => {
  const pending = job({ paymentStatus: 'pending' });
  const local = job({ executionMode: 'local' });
  const paid = job();
  assert.equal(claimNextJob('offgrid', 'Wrong laptop'), null);
  const assignment = claimNextJob('studio.aure', 'Seller laptop')!;
  assert.equal(assignment.job.id, paid.id);
  assert.equal(assignment.job.workerName, 'Seller laptop');
  assert.equal(claimNextJob('studio.aure', 'Another laptop'), null);
  assert.equal(getJob(pending.id)?.status, 'queued');
  assert.equal(getJob(local.id)?.status, 'queued');
  assert.equal('hiddenWorkflowPrompt' in assignment.job.style, false);
  const response = await publicJob(new Request('http://localhost'), {
    params: Promise.resolve({ id: paid.id }),
  });
  assert.equal((await response.text()).includes(assignment.claimToken), false);
  finishWorkerJob('studio.aure', paid.id, assignment.claimToken, '/api/media/example.png');
});
test('marketplace advance never generates a worker-mode image', async () => {
  const waiting = job();
  await advance(new Request('http://localhost', { method: 'POST' }), {
    params: Promise.resolve({ id: waiting.id }),
  });
  assert.equal(getJob(waiting.id)?.status, 'queued');
  assert.equal(getJob(waiting.id)?.outputImageUrl, null);
  const assignment = claimNextJob('studio.aure', 'Renderer')!;
  await advance(new Request('http://localhost', { method: 'POST' }), {
    params: Promise.resolve({ id: waiting.id }),
  });
  assert.equal(getJob(waiting.id)?.generationMode, 'processing');
  finishWorkerJob('studio.aure', waiting.id, assignment.claimToken, '/api/media/example.png');
});
test('leases recover interrupted jobs and reject stale or foreign completions', () => {
  const waiting = job();
  const original = claimNextJob('studio.aure', 'Disconnected laptop')!;
  heartbeat('studio.aure', waiting.id, original.claimToken);
  db()
    .prepare('UPDATE worker_claims SET expiresAt = ? WHERE jobId = ?')
    .run(Date.now() - 1, waiting.id);
  assert.throws(() => requireClaim('studio.aure', waiting.id, original.claimToken), /expired/);
  const replacement = claimNextJob('studio.aure', 'Replacement laptop')!;
  assert.equal(replacement.job.id, waiting.id);
  assert.notEqual(replacement.claimToken, original.claimToken);
  assert.throws(
    () => finishWorkerJob('studio.aure', waiting.id, original.claimToken, '/old.png'),
    /does not own/,
  );
  assert.throws(
    () => finishWorkerJob('offgrid', waiting.id, replacement.claimToken, '/wrong.png'),
    /does not own/,
  );
  const delivered = finishWorkerJob('studio.aure', waiting.id, replacement.claimToken, '/new.png');
  assert.equal(delivered.status, 'delivered');
  assert.equal(delivered.workerName, 'Replacement laptop');
  assert.equal(
    finishWorkerJob('studio.aure', waiting.id, replacement.claimToken, '/duplicate.png')
      .outputImageUrl,
    '/new.png',
  );
});
