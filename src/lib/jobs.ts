import { randomUUID } from 'node:crypto';
import { getStyle, getStyles, saveJob } from './db';
import { pickStyle } from './agent';
import { jobSchema } from './validation';
import { executionMode, sellerHasWorker } from './workers';

export function orderableStyles() {
  return getStyles().filter(
    (style) =>
      style.type === 'image' &&
      (executionMode() === 'local' || sellerHasWorker(style.seller.handle)),
  );
}

export function createJob(values: unknown, requestSource: 'web' | 'agent' = 'web') {
  const input = jobSchema.parse(values);
  const style = getStyle(input.styleListingId);
  if (!style || style.type !== 'image') throw new Error('This image style is no longer available.');
  if (input.budget < style.priceUsdc) throw new Error('The selected style exceeds your budget.');
  const execution = executionMode();
  if (execution === 'worker' && !sellerHasWorker(style.seller.handle))
    throw new Error(
      'This seller has no worker configured. Choose a style from a connected seller.',
    );
  if (input.inputImageUrl)
    throw new Error(
      'New orders are text-to-image. Describe your subject in the brief; reference images will be supported later.',
    );
  const pick = input.selectedByAgent
    ? pickStyle(
        getStyles().filter(
          (listing) => execution === 'local' || sellerHasWorker(listing.seller.handle),
        ),
        input.budget,
        input.desiredTags,
      )
    : null;
  if (input.selectedByAgent && pick?.style.id !== style.id)
    throw new Error('The style selection changed. Please auto-pick again.');
  const now = new Date().toISOString();
  return saveJob({
    ...input,
    requestSource,
    id: randomUUID(),
    status: 'queued',
    decisionReason: pick?.reason || 'Handpicked by you.',
    paymentStatus: 'pending',
    paymentConfirmedAt: null,
    priceUsdc: style.priceUsdc,
    outputImageUrl: null,
    generationMode: null,
    executionMode: execution,
    workerName: null,
    workerClaimedAt: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  });
}
