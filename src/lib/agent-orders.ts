import { createHash } from 'node:crypto';
import { z } from 'zod';
import { db, getJob, getStyle, saveJob } from './db';
import { pickStyle } from './agent';
import { createJob, orderableStyles } from './jobs';
import { jobSchema, tagsSchema } from './validation';
import { paymentMode, jobPaymentMode } from './payment-mode';
import type { GenerationJob, StyleListing } from './types';

export const agentOrderSchema = z.object({
  prompt: jobSchema.shape.buyerBrief,
  budget: jobSchema.shape.budget,
  desiredTags: tagsSchema.default([]),
  brandName: jobSchema.shape.brandName,
  styleListingId: z.string().min(1).optional(),
  payment: z.enum(['simulated', 'pay-sandbox']),
});
export class AgentOrderError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

// Transparent keyword matching for the demo, not an LLM. External agents can supply tags.
export function inferTags(prompt: string, styles: StyleListing[]) {
  const words = new Set(prompt.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
  const aliases: Record<string, string[]> = {
    luxury: ['premium', 'elegant'],
    minimal: ['minimalist', 'clean'],
    cinematic: ['cinema', 'film'],
    organic: ['botanical', 'natural'],
    meme: ['memes'],
    cute: ['adorable'],
    streetwear: ['sneakers'],
  };
  return [...new Set(styles.flatMap((style) => style.tags))]
    .filter((tag) => words.has(tag.toLowerCase()) || aliases[tag]?.some((word) => words.has(word)))
    .slice(0, 12);
}

export function createAgentOrder(values: unknown, requestKey: string | null) {
  const input = agentOrderSchema.parse(values);
  if (!requestKey || !/^[a-zA-Z0-9._:-]{8,120}$/.test(requestKey))
    throw new AgentOrderError(
      'Send an Idempotency-Key header (8–120 letters, digits, dots, underscores, colons, or hyphens). Reuse it when retrying this order.',
      400,
    );
  const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const conn = db();
  conn.exec('BEGIN IMMEDIATE');
  try {
    const previous = conn
      .prepare('SELECT requestHash, jobId FROM agent_requests WHERE requestKey = ?')
      .get(requestKey) as { requestHash: string; jobId: string } | undefined;
    if (previous) {
      if (previous.requestHash !== hash)
        throw new AgentOrderError(
          'This Idempotency-Key belongs to a different request. Use a new key for a new order.',
          409,
        );
      const job = getJob(previous.jobId)!;
      conn.exec('COMMIT');
      return { job, replayed: true };
    }
    if (input.payment !== paymentMode())
      throw new AgentOrderError(
        `This marketplace requires payment: "${paymentMode()}". Check GET /api/agent before ordering.`,
        400,
      );
    const styles = orderableStyles();
    const tags = input.desiredTags.length ? input.desiredTags : inferTags(input.prompt, styles);
    const pick = pickStyle(styles, input.budget, tags);
    const style = input.styleListingId
      ? styles.find((style) => style.id === input.styleListingId)
      : pick?.style;
    if (!style)
      throw new AgentOrderError(
        'No orderable style fits this request. Check /api/agent/styles, increase your budget, or configure a seller worker.',
        422,
      );
    const job = createJob(
      {
        styleListingId: style.id,
        buyerBrief: input.prompt,
        budget: input.budget,
        desiredTags: tags,
        brandName: input.brandName,
        selectedByAgent: !input.styleListingId,
      },
      'agent',
    );
    const now = new Date().toISOString();
    const paid = saveJob({
      ...job,
      paymentStatus: input.payment === 'simulated' ? 'confirmed' : 'pending',
      paymentConfirmedAt: input.payment === 'simulated' ? now : null,
      decisionReason: input.styleListingId
        ? 'Style selected by the buyer’s external agent.'
        : job.decisionReason,
      updatedAt: now,
    });
    conn.prepare('INSERT INTO agent_requests VALUES (?, ?, ?)').run(requestKey, hash, job.id);
    conn.exec('COMMIT');
    return { job: paid, replayed: false };
  } catch (error) {
    conn.exec('ROLLBACK');
    throw error;
  }
}

export function agentOrderView(job: GenerationJob) {
  return {
    jobId: job.id,
    status: job.status,
    payment: {
      mode: jobPaymentMode(job),
      status: job.paymentStatus,
      amountUsdc: job.priceUsdc,
      receipt: job.paymentReceipt || null,
    },
    paymentUrl: job.paymentStatus === 'pending' ? `/api/jobs/${job.id}/pay` : null,
    style: getStyle(job.styleListingId),
    desiredTags: job.desiredTags,
    decisionReason: job.decisionReason,
    executionMode: job.executionMode || 'local',
    generationMode: job.generationMode,
    workerName: job.workerName || null,
    error: job.error,
    statusUrl: `/api/agent/orders/${job.id}`,
    viewUrl: `/jobs/${job.id}`,
    outputImageUrl: job.outputImageUrl,
    downloadUrl: job.outputImageUrl ? `${job.outputImageUrl}?download=1` : null,
    advanceUrl: job.executionMode === 'worker' ? null : `/api/jobs/${job.id}/advance`,
    retryUrl: job.status === 'failed' ? `/api/jobs/${job.id}/retry` : null,
    pollAfterMs: job.status === 'delivered' || job.status === 'failed' ? null : 2000,
  };
}
export type AgentOrderView = ReturnType<typeof agentOrderView>;
