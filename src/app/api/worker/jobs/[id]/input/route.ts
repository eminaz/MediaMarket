import { readImage } from '@/lib/media';
import { authenticateWorker, requireClaim, workerResponse, WorkerError } from '@/lib/workers';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const job = requireClaim(
      authenticateWorker(request),
      (await params).id,
      request.headers.get('x-claim-token') || '',
    );
    if (!job.inputImageUrl)
      throw new WorkerError('This text-to-image job has no input image.', 404);
    return new Response(new Uint8Array(await readImage(job.inputImageUrl)), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return workerResponse(error);
  }
}
