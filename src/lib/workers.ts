import { randomUUID, timingSafeEqual } from 'node:crypto';
import { db, getJob, getStyle, getPrivateStyle, saveJob } from './db';
import type { GenerationJob, JobWithStyle } from './types';
import { paymentReady } from './payment-mode';

// Claim tokens are kept in a separate table, never in public job responses.
export const WORKER_LEASE_MS = 60_000;
export type WorkerAssignment = {
  job: JobWithStyle;
  claimToken: string;
  leaseMs: number;
  workflowPrompt: string;
};
type Claim = { jobId: string; sellerHandle: string; token: string; expiresAt: number };
export class WorkerError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
export function workerResponse(error: unknown) {
  return Response.json(
    { error: error instanceof WorkerError ? error.message : 'Worker request failed.' },
    { status: error instanceof WorkerError ? error.status : 400 },
  );
}
function credentials(): Record<string, string> {
  try {
    const parsed = JSON.parse(process.env.SELLER_WORKER_TOKENS || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new Error('Invalid seller worker configuration.');
  }
}
export function executionMode(): 'local' | 'worker' {
  return process.env.EXECUTION_MODE === 'worker' ? 'worker' : 'local';
}
export function sellerHasWorker(handle: string) {
  const token = credentials()[handle];
  return typeof token === 'string' && token.length >= 16;
}
export function authenticateWorker(request: Request) {
  const handle = request.headers.get('x-seller-handle') || '';
  const expected = credentials()[handle];
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  if (
    typeof expected !== 'string' ||
    expected.length < 16 ||
    Buffer.byteLength(token) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  ) {
    throw new WorkerError('Invalid seller worker credentials.', 401);
  }
  return handle;
}
export function claimNextJob(handle: string, workerName: string): WorkerAssignment | null {
  const conn = db();
  conn.exec('BEGIN IMMEDIATE');
  try {
    // A disconnected laptop's lease expires, allowing another worker for the same seller to resume.
    const expired = conn
      .prepare('SELECT * FROM worker_claims WHERE sellerHandle = ? AND expiresAt < ?')
      .all(handle, Date.now()) as Claim[];
    for (const claim of expired) {
      const job = getJob(claim.jobId);
      if (job?.status === 'generating' && job.executionMode === 'worker') {
        saveJob({
          ...job,
          status: 'queued',
          generationMode: null,
          workerName: null,
          workerClaimedAt: null,
          updatedAt: new Date().toISOString(),
        });
      }
    }
    const rows = conn
      .prepare(
        "SELECT data FROM jobs WHERE json_extract(data, '$.executionMode') = 'worker' AND json_extract(data, '$.status') = 'queued' AND json_extract(data, '$.paymentStatus') = 'confirmed' ORDER BY rowid",
      )
      .all() as { data: string }[];
    for (const row of rows) {
      const job: GenerationJob = JSON.parse(row.data);
      if (!paymentReady(job)) continue;
      const style = getStyle(job.styleListingId);
      if (style?.seller.handle !== handle) continue;
      const claimToken = randomUUID();
      const now = new Date().toISOString();
      const claimed = saveJob({
        ...job,
        status: 'generating',
        workerName,
        workerClaimedAt: now,
        generationMode: 'processing',
        error: null,
        updatedAt: now,
      });
      conn
        .prepare(
          'INSERT INTO worker_claims VALUES (?, ?, ?, ?) ON CONFLICT(jobId) DO UPDATE SET sellerHandle = excluded.sellerHandle, token = excluded.token, expiresAt = excluded.expiresAt',
        )
        .run(job.id, handle, claimToken, Date.now() + WORKER_LEASE_MS);
      const workflowPrompt = getPrivateStyle(style.id)!.hiddenWorkflowPrompt;
      conn.exec('COMMIT');
      return { job: { ...claimed, style }, claimToken, leaseMs: WORKER_LEASE_MS, workflowPrompt };
    }
    conn.exec('COMMIT');
    return null;
  } catch (error) {
    conn.exec('ROLLBACK');
    throw error;
  }
}
export function requireClaim(handle: string, id: string, token: string, allowDelivered = false) {
  const claim = db().prepare('SELECT * FROM worker_claims WHERE jobId = ?').get(id) as
    Claim | undefined;
  const job = getJob(id);
  if (!job || !claim || claim.sellerHandle !== handle || claim.token !== token)
    throw new WorkerError('This worker does not own the job.', 403);
  if (allowDelivered && job.status === 'delivered') return job;
  if (
    claim.expiresAt <= Date.now() ||
    job.status !== 'generating' ||
    job.executionMode !== 'worker'
  )
    throw new WorkerError('The job lease expired or the job is no longer generating.');
  return job;
}
export function heartbeat(handle: string, id: string, token: string) {
  requireClaim(handle, id, token);
  db()
    .prepare('UPDATE worker_claims SET expiresAt = ? WHERE jobId = ? AND token = ?')
    .run(Date.now() + WORKER_LEASE_MS, id, token);
}
export function finishWorkerJob(
  handle: string,
  id: string,
  token: string,
  outputImageUrl: string,
  generationMode: 'mock' | 'local' = 'mock',
) {
  // Re-check after image processing; an old laptop must never overwrite a new claim.
  const job = requireClaim(handle, id, token, true);
  if (job.status === 'delivered') return job;
  return saveJob({
    ...job,
    status: 'delivered',
    generationMode,
    outputImageUrl,
    error: null,
    updatedAt: new Date().toISOString(),
  });
}
