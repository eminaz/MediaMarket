import { getJob, saveJob } from './db';
import { inspectSettlement } from './payment-evidence';
import { paymentReady } from './payment-mode';

// Only a receipt previously accepted by Pay may reach this step. Persist it before RPC access,
// so a timeout retries verification of the same signature, never a second payment.
export async function verifySavedPayment(
  id: string,
  fetchTransaction: (signature: string) => Promise<unknown>,
) {
  const job = getJob(id)!;
  if (paymentReady(job)) return job;
  const receipt = job.paymentReceipt;
  if (!receipt || !job.payoutAddress || receipt.recipient !== job.payoutAddress)
    throw new Error('No accepted receipt for the selected payout address.');
  try {
    const evidence = inspectSettlement(await fetchTransaction(receipt.transaction), {
      signature: receipt.transaction,
      recipient: job.payoutAddress,
      amountUsdc: job.priceUsdc,
      orderId: job.id,
    });
    return saveJob({
      ...getJob(id)!,
      paymentStatus: 'confirmed',
      paymentConfirmedAt: evidence.verifiedAt,
      paymentVerificationError: null,
      updatedAt: evidence.verifiedAt,
      paymentReceipt: { ...receipt, payer: evidence.buyerAddress, evidence },
    });
  } catch (error) {
    saveJob({
      ...getJob(id)!,
      paymentStatus: 'pending',
      paymentConfirmedAt: null,
      paymentVerificationError:
        error instanceof Error ? error.message : 'Chain verification failed.',
      updatedAt: new Date().toISOString(),
    });
    throw error;
  }
}
