import { CheckCircle2 } from 'lucide-react';
import type { JobWithStyle } from '@/lib/types';
import { displayUsdc, shortAddress } from '@/lib/payment-display';

export function PaymentProof({ job }: { job: JobWithStyle }) {
  const evidence = job.paymentReceipt?.evidence;
  if (!evidence) return null;
  return (
    <section className="payment-proof" aria-label="On-chain payment proof">
      <div className="payment-proof-title">
        <CheckCircle2 size={18} />
        <h3>Payment settled</h3>
      </div>
      <p className="payment-proof-network">PAY.SH SANDBOX · TEST USDC</p>
      {[
        {
          name: 'Buyer',
          address: evidence.buyerAddress,
          before: evidence.buyerBalanceBefore,
          after: evidence.buyerBalanceAfter,
          delta: evidence.buyerDelta,
        },
        {
          name: 'Seller',
          address: evidence.sellerAddress,
          before: evidence.sellerBalanceBefore,
          after: evidence.sellerBalanceAfter,
          delta: `+${evidence.sellerDelta}`,
        },
      ].map((side) => (
        <div
          className="payment-proof-wallet"
          key={side.name}
          data-testid={`payment-${side.name.toLowerCase()}`}
        >
          <div>
            <strong>{side.name}</strong>
            <code title={side.address}>{shortAddress(side.address)}</code>
          </div>
          <p>
            {displayUsdc(side.before)} → {displayUsdc(side.after)} USDC
          </p>
          <b className={side.name === 'Seller' ? 'payment-credit' : ''}>
            {displayUsdc(side.delta)} USDC
          </b>
        </div>
      ))}
      <details>
        <summary>Transaction & full addresses</summary>
        <p>Transaction</p>
        <code>{evidence.signature}</code>
        <p>Buyer</p>
        <code>{evidence.buyerAddress}</code>
        <p>Seller payout address</p>
        <code>{evidence.sellerAddress}</code>
        <p>Confirmed slot {evidence.slot}</p>
      </details>
      <p className="payment-proof-note">
        Actual pre/post USDC balances of the token accounts involved in this transaction. These are
        not live wallet totals.
      </p>
      <p className="payment-proof-status">
        {job.status === 'queued'
          ? 'Payment verified — waiting for seller'
          : job.workerClaimedAt
            ? 'Payment verified — seller started generation'
            : 'Payment verified — generation authorized'}
      </p>
    </section>
  );
}
