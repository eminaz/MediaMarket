import { saveUpload } from '@/lib/media';
import {
  authenticateWorker,
  requireClaim,
  finishWorkerJob,
  workerResponse,
  WorkerError,
} from '@/lib/workers';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const handle = authenticateWorker(request);
    const id = (await params).id;
    const token = request.headers.get('x-claim-token') || '';
    const job = requireClaim(handle, id, token, true);
    if (job.status === 'delivered') return Response.json({ job });
    if (Number(request.headers.get('content-length')) > 11 * 1024 * 1024)
      throw new WorkerError('Output is too large.', 413);
    const form = await request.formData();
    const image = form.get('image');
    if (!(image instanceof File) || image.type !== 'image/png')
      throw new WorkerError('A PNG output is required.', 400);
    const outputImageUrl = await saveUpload(image);
    return Response.json({ job: finishWorkerJob(handle, id, token, outputImageUrl) });
  } catch (error) {
    return workerResponse(error);
  }
}
