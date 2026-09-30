import type { GenerationJob } from './types';
export const PAY_SANDBOX_RPC = 'https://402.surfnet.dev:8899';
export function paymentMode(): 'simulated' | 'pay-sandbox' {
  const mode = process.env.PAYMENT_MODE || 'simulated';
  if (mode !== 'simulated' && mode !== 'pay-sandbox')
    throw new Error('PAYMENT_MODE must be simulated or pay-sandbox. Mainnet is not enabled.');
  return mode;
}
export function jobPaymentMode(job: GenerationJob) {
  return job.paymentMode || 'simulated';
}
export function paymentReady(job: GenerationJob) {
  const evidence = job.paymentReceipt?.evidence;
  return (
    job.paymentStatus === 'confirmed' &&
    (jobPaymentMode(job) !== 'pay-sandbox' ||
      Boolean(
        evidence?.verifiedAt &&
        evidence.signature === job.paymentReceipt?.transaction &&
        evidence.sellerAddress === job.payoutAddress &&
        evidence.sellerAddress === job.paymentReceipt?.recipient &&
        Number(evidence.amountUsdc) === job.priceUsdc,
      ))
  );
}
