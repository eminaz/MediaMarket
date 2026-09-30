import { getJob, saveJob } from '@/lib/db';
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const job = getJob((await params).id);
  if (!job) return Response.json({ error: 'Job not found.' }, { status: 404 });
  if (job.paymentStatus === 'confirmed') return Response.json(job);
  if (Date.now() - Date.parse(job.createdAt) < 1200)
    return Response.json({ ...job, retryAfterMs: 1200 }, { status: 202 });
  const now = new Date().toISOString();
  return Response.json(
    saveJob({ ...job, paymentStatus: 'confirmed', paymentConfirmedAt: now, updatedAt: now }),
  );
}
