import { getStyle } from '@/lib/db';
import { getStyleReviews } from '@/lib/reviews';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const style = getStyle(id);
  if (!style) return Response.json({ error: 'Style not found.' }, { status: 404 });
  return Response.json(
    {
      averageRating: style.averageRating,
      reviewCount: style.reviewCount,
      reviews: getStyleReviews(id),
      limit: 20,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
