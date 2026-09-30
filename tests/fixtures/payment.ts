import { USDC_MINT } from '../../src/lib/payment-evidence';
import { defaultPayoutAddress } from '../../src/lib/payout';

export const buyer = defaultPayoutAddress('test.buyer');
export const seller = defaultPayoutAddress('studio.aure');
export const expected = {
  signature: 'accepted-signature',
  recipient: seller,
  amountUsdc: 2.5,
  orderId: 'test-order',
};
export function transaction(orderId = expected.orderId) {
  const balance = (index: number, owner: string, amount: string) => ({
    accountIndex: index,
    owner,
    mint: USDC_MINT,
    uiTokenAmount: { amount, decimals: 6 },
  });
  return {
    slot: 123,
    meta: {
      err: null as unknown,
      preTokenBalances: [balance(2, buyer, '97500000'), balance(3, seller, '3200000')],
      postTokenBalances: [balance(2, buyer, '95000000'), balance(3, seller, '5700000')],
    },
    transaction: {
      signatures: [expected.signature],
      message: {
        accountKeys: [
          { pubkey: 'operator', signer: true },
          { pubkey: buyer, signer: true },
          { pubkey: 'buyer-token-account', signer: false },
          { pubkey: 'seller-token-account', signer: false },
        ],
        instructions: [
          {
            programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
            parsed: {
              type: 'transferChecked',
              info: {
                authority: buyer,
                source: 'buyer-token-account',
                destination: 'seller-token-account',
                mint: USDC_MINT,
                tokenAmount: { amount: '2500000', decimals: 6 },
              },
            },
          },
          { programId: 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', parsed: orderId },
        ],
      },
    },
  };
}
