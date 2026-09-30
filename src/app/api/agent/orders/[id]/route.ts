import { getJob } from '@/lib/db';
import { agentOrderView } from '@/lib/agent-orders';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const job = getJob((await params).id);
  if (!job) return Response.json({ error: 'Job not found.' }, { status: 404 });
  return Response.json(agentOrderView(job), { headers: { 'Cache-Control': 'no-store' } });
}
