import { getJob, saveJob } from '@/lib/db';
import { jobPaymentMode, paymentReady } from '@/lib/payment-mode';
export const maxDuration = 180;
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const job = getJob((await params).id);
  if (!job) return Response.json({ error: 'Job not found.' }, { status: 404 });
  if (paymentReady(job)) return Response.json(job);
  if (jobPaymentMode(job) === 'pay-sandbox') {
    try {
      const { paySandboxOrder } = await import('@/lib/pay-sandbox');
      return await paySandboxOrder(request, job);
    } catch (error) {
      console.error('Pay sandbox:', error instanceof Error ? error.message : 'Payment failed');
      return Response.json(
        {
          error:
            'Pay sandbox could not verify payment. Check the saved order and retry; no mock payment was substituted.',
        },
        { status: 503 },
      );
    }
  }
  if (Date.now() - Date.parse(job.createdAt) < 1200)
    return Response.json({ ...job, retryAfterMs: 1200 }, { status: 202 });
  const now = new Date().toISOString();
  return Response.json(
    saveJob({ ...job, paymentStatus: 'confirmed', paymentConfirmedAt: now, updatedAt: now }),
  );
}
