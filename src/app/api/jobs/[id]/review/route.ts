import { getJob } from '@/lib/db';
import { getOrderReview, ReviewError, submitReview } from '@/lib/reviews';
import { apiError } from '@/lib/validation';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getJob(id)) return Response.json({ error: 'Order not found.' }, { status: 404 });
  return Response.json(
    { review: getOrderReview(id) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = submitReview((await params).id, await request.json());
    return Response.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return error instanceof ReviewError
      ? Response.json({ error: error.message }, { status: error.status })
      : apiError(error);
  }
}
