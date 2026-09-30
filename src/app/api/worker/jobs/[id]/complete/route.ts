import { saveUpload, saveAudioUpload, saveVideoUpload } from '@/lib/media';
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
    const video = style.type === 'video';
    const limit = video ? 65 : music ? 33 : 11;
    if (Number(request.headers.get('content-length')) > limit * 1024 * 1024)
      throw new WorkerError('Output is too large.', 413);
    const form = await request.formData();
    const mode = form.get('generationMode') || 'mock';
    if (mode !== 'mock' && mode !== 'local')
      throw new WorkerError('Unsupported worker generation mode.', 400);
    const output = form.get(video ? 'video' : music ? 'audio' : 'image');
    if (!(output instanceof File) || (!music && !video && output.type !== 'image/png'))
      throw new WorkerError(
        video
          ? 'An MP4 output is required.'
          : music
            ? 'A WAV output is required.'
            : 'A PNG output is required.',
        400,
      );
    const outputUrl = video
      ? await saveVideoUpload(output, style.durationSeconds || 15)
      : music
        ? await saveAudioUpload(output, style.durationSeconds || 10)
        : await saveUpload(output);
    return Response.json({ job: finishWorkerJob(handle, id, token, outputUrl, mode) });
  } catch (error) {
    return workerResponse(error);
  }
}
