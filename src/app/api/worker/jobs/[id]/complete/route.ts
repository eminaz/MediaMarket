import { saveUpload, saveAudioUpload } from '@/lib/media';
import { getStyle } from '@/lib/db';
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
    const style = getStyle(job.styleListingId)!;
    const music = style.type === 'music';
    if (Number(request.headers.get('content-length')) > (music ? 33 : 11) * 1024 * 1024)
      throw new WorkerError('Output is too large.', 413);
    const form = await request.formData();
    const mode = form.get('generationMode') || 'mock';
    if (mode !== 'mock' && mode !== 'local')
      throw new WorkerError('Unsupported worker generation mode.', 400);
    const image = form.get(music ? 'audio' : 'image');
    if (!(image instanceof File) || (!music && image.type !== 'image/png'))
      throw new WorkerError(music ? 'A WAV output is required.' : 'A PNG output is required.', 400);
    const outputImageUrl = music
      ? await saveAudioUpload(image, style.durationSeconds || 10)
      : await saveUpload(image);
    return Response.json({ job: finishWorkerJob(handle, id, token, outputImageUrl, mode) });
  } catch (error) {
    return workerResponse(error);
  }
}
