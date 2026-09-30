import { randomUUID } from 'node:crypto';
import { getStyle, getStyles, saveJob } from '@/lib/db';
import { pickStyle } from '@/lib/agent';
import { readImage } from '@/lib/media';
import { apiError, jobSchema } from '@/lib/validation';
import { executionMode, sellerHasWorker } from '@/lib/workers';
export async function POST(request: Request) {
  try {
    const input = jobSchema.parse(await request.json());
    const style = getStyle(input.styleListingId);
    if (!style || style.type !== 'image')
      throw new Error('This image style is no longer available.');
    if (input.budget < style.priceUsdc) throw new Error('The selected style exceeds your budget.');
    const execution = executionMode();
    if (execution === 'worker' && !sellerHasWorker(style.seller.handle))
      throw new Error(
        'This seller has no worker configured. Choose a style from a connected seller.',
      );
    await readImage(input.inputImageUrl);
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
    const job = saveJob({
      ...input,
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
    return Response.json(job, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
