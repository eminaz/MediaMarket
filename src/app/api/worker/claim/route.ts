import { z } from 'zod';
import { authenticateWorker, claimNextJob, workerResponse } from '@/lib/workers';
export async function POST(request: Request) {
  try {
    const handle = authenticateWorker(request);
    const { workerName } = z
      .object({ workerName: z.string().trim().min(2).max(60) })
      .parse(await request.json());
    return Response.json(
      { assignment: claimNextJob(handle, workerName) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return workerResponse(error);
  }
}
