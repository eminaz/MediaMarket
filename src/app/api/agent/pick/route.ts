import { z } from 'zod';
import { getStyles } from '@/lib/db';
import { pickStyle } from '@/lib/agent';
import { apiError, tagsSchema } from '@/lib/validation';
export async function POST(request: Request) {
  try {
    const { budget, desiredTags } = z
      .object({ budget: z.number().finite().positive().max(10000), desiredTags: tagsSchema })
      .parse(await request.json());
    const pick = pickStyle(getStyles(), budget, desiredTags);
    if (!pick)
      return Response.json(
        {
          error:
            'No styles fit this budget. Try at least 0.75 USDC, or publish a more affordable style.',
        },
        { status: 422 },
      );
    return Response.json(pick);
  } catch (error) {
    return apiError(error);
  }
}
