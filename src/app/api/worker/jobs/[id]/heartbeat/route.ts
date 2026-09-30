import { authenticateWorker, heartbeat, workerResponse } from '@/lib/workers';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    heartbeat(
      authenticateWorker(request),
      (await params).id,
      request.headers.get('x-claim-token') || '',
    );
    return Response.json({ ok: true });
  } catch (error) {
    return workerResponse(error);
  }
}
