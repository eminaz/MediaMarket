import { db, getJob, getPrivateStyle, saveJob } from '@/lib/db';
import { generateImage } from '@/lib/generation';
export const maxDuration = 180;
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const job = getJob((await params).id);
  if (!job) return Response.json({ error: 'Job not found.' }, { status: 404 });
  if (job.paymentStatus !== 'confirmed')
    return Response.json({ error: 'Confirm the simulated payment first.' }, { status: 409 });
  if (job.status === 'delivered' || job.status === 'failed') return Response.json(job);
  const elapsed = Date.now() - Date.parse(job.updatedAt);
  if (job.status === 'queued') {
    if (elapsed < 1200) return Response.json(job);
    return Response.json(
      saveJob({ ...job, status: 'generating', updatedAt: new Date().toISOString() }),
    );
  }
  if (job.generationMode === 'processing') {
    if (elapsed > 180_000)
      return Response.json(
        saveJob({
          ...job,
          status: 'failed',
          error: 'Generation was interrupted. You can retry without another payment.',
          updatedAt: new Date().toISOString(),
        }),
      );
    return Response.json(job);
  }
  if (elapsed < 3000) return Response.json(job);
  // Atomic compare-and-swap prevents duplicate provider calls from multiple tabs.
  const claimed = { ...job, generationMode: 'processing', updatedAt: new Date().toISOString() };
  const result = db()
    .prepare('UPDATE jobs SET data = ? WHERE id = ? AND data = ?')
    .run(JSON.stringify(claimed), job.id, JSON.stringify(job));
  if (!result.changes) return Response.json(getJob(job.id));
  try {
    const style = getPrivateStyle(job.styleListingId)!;
    const output = await generateImage({
      inputImage: job.inputImageUrl,
      buyerBrief: job.buyerBrief,
      brandName: job.brandName,
      styleListing: style,
    });
    return Response.json(
      saveJob({ ...claimed, ...output, status: 'delivered', updatedAt: new Date().toISOString() }),
    );
  } catch (error) {
    return Response.json(
      saveJob({
        ...claimed,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Generation failed. Please retry.',
        updatedAt: new Date().toISOString(),
      }),
    );
  }
}
