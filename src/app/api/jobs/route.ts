import { createJob } from '@/lib/jobs';
import { apiError } from '@/lib/validation';
export async function POST(request: Request) {
  try {
    return Response.json(createJob(await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
