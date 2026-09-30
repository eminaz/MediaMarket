import { saveJob } from '@/lib/db';
import { authenticateWorker, requireClaim, workerResponse } from '@/lib/workers';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const job = requireClaim(
      authenticateWorker(request),
      (await params).id,
      request.headers.get('x-claim-token') || '',
    );
    saveJob({
      ...job,
      status: 'failed',
      error:
        'The seller’s worker could not finish this image. Please retry; no additional payment is needed.',
      updatedAt: new Date().toISOString(),
    });
    return Response.json({ ok: true });
  } catch (error) {
    return workerResponse(error);
  }
}
