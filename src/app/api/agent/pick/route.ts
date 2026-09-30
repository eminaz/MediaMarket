import { z } from 'zod';
import { getStyles } from '@/lib/db';
import { pickStyle } from '@/lib/agent';
import { apiError, tagsSchema } from '@/lib/validation';
import { executionMode, sellerHasWorker } from '@/lib/workers';
export async function POST(request: Request) {
  try {
    const { budget, desiredTags, type } = z
      .object({
        budget: z.number().finite().positive().max(10000),
        desiredTags: tagsSchema,
        type: z.enum(['image', 'music']).default('image'),
      })
      .parse(await request.json());
    const available = getStyles().filter(
      (style) => executionMode() === 'local' || sellerHasWorker(style.seller.handle),
    );
    const pick = pickStyle(available, budget, desiredTags, type);
    if (!pick)
      return Response.json(
        {
          error:
            executionMode() === 'worker'
              ? 'No configured seller styles fit this budget. Increase your budget or connect another seller worker.'
              : 'No styles fit this budget. Try at least 0.75 USDC, or publish a more affordable style.',
        },
        { status: 422 },
      );
    return Response.json(pick);
  } catch (error) {
    return apiError(error);
  }
}
