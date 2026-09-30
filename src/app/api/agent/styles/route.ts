import { z } from 'zod';
import { orderableStyles } from '@/lib/jobs';
import { executionMode } from '@/lib/workers';
import { apiError } from '@/lib/validation';
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const budget = z.coerce
      .number()
      .finite()
      .min(0)
      .max(10000)
      .parse(params.get('budget') ?? 10000);
    const query = (params.get('q') || '').toLowerCase().trim();
    const tags = (params.get('tags') || '')
      .toLowerCase()
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    const styles = orderableStyles().filter(
      (style) =>
        style.priceUsdc <= budget &&
        (!query ||
          `${style.name} ${style.description} ${style.seller.handle} ${style.tags.join(' ')}`
            .toLowerCase()
            .includes(query)) &&
        (!tags.length ||
          tags.some((tag) => style.tags.some((value) => value.toLowerCase() === tag))),
    );
    return Response.json(
      {
        executionMode: executionMode(),
        styles,
        availabilityNote:
          'Worker configuration is not live presence. If a seller worker is offline, its orders remain queued.',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
