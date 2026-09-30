import { getJob, saveJob } from '@/lib/db';
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const job = getJob((await params).id);
  if (!job) return Response.json({ error: 'Job not found.' }, { status: 404 });
  if (job.status !== 'failed' || job.paymentStatus !== 'confirmed')
    return Response.json({ error: 'Only failed, paid jobs can be retried.' }, { status: 409 });
  return Response.json(
    saveJob({
      ...job,
      status: 'queued',
      generationMode: null,
      error: null,
      updatedAt: new Date().toISOString(),
    }),
  );
}
