import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectSettlement } from '../src/lib/payment-evidence';
import { Signer } from '@solana/pay-kit';
import { createHash } from 'node:crypto';

import { buyer, seller, expected, transaction } from './fixtures/payment';

test('derives the same fallback seller address as the existing Pay signer', async () => {
  const previous = await Signer.bytes(
    createHash('sha256').update('tastemaker-sandbox-seller:studio.aure').digest(),
  );
  assert.equal(seller, previous.pubkey);
});
test('reads real metadata values and verifies exact seller delta', () => {
  const evidence = inspectSettlement(transaction(), expected);
  assert.equal(evidence.buyerAddress, buyer);
  assert.equal(evidence.buyerBalanceBefore, '97.500000');
  assert.equal(evidence.buyerBalanceAfter, '95.000000');
  assert.equal(evidence.buyerDelta, '-2.500000');
  assert.equal(evidence.sellerBalanceBefore, '3.200000');
  assert.equal(evidence.sellerBalanceAfter, '5.700000');
  assert.equal(evidence.sellerDelta, '2.500000');
});
test('rejects wrong recipient, wrong amount, failed and missing transactions', () => {
  assert.throws(
    () => inspectSettlement(transaction(), { ...expected, recipient: buyer }),
    /Seller USDC delta/,
  );
  assert.throws(
    () => inspectSettlement(transaction(), { ...expected, recipient: 'wrong-recipient' }),
    /payout address/,
  );
  assert.throws(
    () => inspectSettlement(transaction(), { ...expected, amountUsdc: 2.49 }),
    /Seller USDC delta/,
  );
  const microMismatch = transaction();
  microMismatch.meta.postTokenBalances[1].uiTokenAmount.amount = '5700001';
  assert.throws(() => inspectSettlement(microMismatch, expected), /Seller USDC delta/);
  const failed = transaction();
  failed.meta.err = { InstructionError: [2, 'failed'] };
  assert.throws(() => inspectSettlement(failed, expected), /transaction failed/);
  assert.throws(() => inspectSettlement(null, expected), /not available/);
});
test('missing preTokenBalance for a newly created seller token account is zero', () => {
  const tx = transaction();
  tx.meta.preTokenBalances.pop();
  tx.meta.postTokenBalances[1].uiTokenAmount.amount = '2500000';
  const evidence = inspectSettlement(tx, expected);
  assert.equal(evidence.sellerBalanceBefore, '0.000000');
  assert.equal(evidence.sellerBalanceAfter, '2.500000');
});
test('rejects missing metadata, other mint, wrong precision and receipt/order mismatch', () => {
  const tx = transaction();
  tx.meta.postTokenBalances[1].mint = 'other-mint';
  assert.throws(() => inspectSettlement(tx, expected), /Inconsistent/);
  const precision = transaction();
  precision.meta.preTokenBalances[0].uiTokenAmount.decimals = 9;
  assert.throws(() => inspectSettlement(precision, expected), /Inconsistent/);
  const missing = { ...transaction(), meta: { err: null } };
  assert.throws(() => inspectSettlement(missing, expected));
  assert.throws(
    () => inspectSettlement(transaction(), { ...expected, signature: 'other' }),
    /signature/,
  );
  assert.throws(() => inspectSettlement(transaction(), { ...expected, orderId: 'other' }), /memo/);
});
test('never confuses the fee payer with buyer, rejects missing debit or unsigned owner', () => {
  const tx = transaction();
  tx.meta.postTokenBalances[0].uiTokenAmount.amount = '97500000';
  assert.throws(() => inspectSettlement(tx, expected), /buyer USDC debit/);
  const unsigned = transaction();
  unsigned.transaction.message.accountKeys[1].signer = false;
  assert.throws(() => inspectSettlement(unsigned, expected), /did not sign/);
});
