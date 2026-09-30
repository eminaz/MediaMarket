import { getJob, getStyle } from '@/lib/db';
import { getOrderReview } from '@/lib/reviews';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const job = getJob((await params).id);
  if (!job) return Response.json({ error: 'Job not found.' }, { status: 404 });
  return Response.json(
    { ...job, style: getStyle(job.styleListingId), review: getOrderReview(job.id) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
