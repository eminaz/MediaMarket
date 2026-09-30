import { AgentOrderError, agentOrderView, createAgentOrder } from '@/lib/agent-orders';
import { apiError } from '@/lib/validation';
export async function POST(request: Request) {
  try {
    const { job, replayed } = createAgentOrder(
      await request.json(),
      request.headers.get('idempotency-key'),
    );
    const order = agentOrderView(job);
    return Response.json(
      { ...order, replayed },
      {
        status: replayed ? 200 : 201,
        headers: { Location: order.statusUrl, 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    if (error instanceof AgentOrderError)
      return Response.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
