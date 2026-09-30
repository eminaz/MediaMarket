import { z } from 'zod';
import type { PaymentEvidence } from './types';

export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const balanceSchema = z.object({
  accountIndex: z.number().int().nonnegative(),
  mint: z.string(),
  owner: z.string().optional(),
  programId: z.string().optional(),
  uiTokenAmount: z.object({
    amount: z.string().regex(/^\d+$/).max(20),
    decimals: z.number().int(),
  }),
});
const instructionSchema = z.object({ programId: z.string(), parsed: z.unknown().optional() });
const transactionSchema = z.object({
  slot: z.number().int().nonnegative(),
  meta: z.object({
    err: z.unknown().refine((value) => value === null, 'Settlement transaction failed.'),
    preTokenBalances: z.array(balanceSchema),
    postTokenBalances: z.array(balanceSchema),
    innerInstructions: z
      .array(z.object({ instructions: z.array(instructionSchema) }))
      .optional()
      .nullable(),
  }),
  transaction: z.object({
    signatures: z.array(z.string()).min(1),
    message: z.object({
      accountKeys: z.array(z.object({ pubkey: z.string(), signer: z.boolean() })),
      instructions: z.array(instructionSchema),
    }),
  }),
});
const transferSchema = z.object({
  type: z.literal('transferChecked'),
  info: z.object({
    authority: z.string(),
    source: z.string(),
    destination: z.string(),
    mint: z.string(),
    tokenAmount: z.object({ amount: z.string(), decimals: z.literal(6) }),
  }),
});
export function usdcUnits(price: number) {
  if (
    !Number.isFinite(price) ||
    price <= 0 ||
    Math.abs(price * 100 - Math.round(price * 100)) > 1e-8
  )
    throw new Error('Invalid order price.');
  return BigInt(price.toFixed(2).replace('.', '')) * 10_000n;
}
export function decimalUsdc(units: bigint) {
  const value = units < 0n ? -units : units;
  return `${units < 0n ? '-' : ''}${value / 1_000_000n}.${(value % 1_000_000n).toString().padStart(6, '0')}`;
}

// Balances cover this transaction's participating USDC token accounts, grouped by owner.
// They are historical transaction evidence, not a query of every account a wallet owns.
export function inspectSettlement(
  value: unknown,
  expected: { signature: string; recipient: string; amountUsdc: number; orderId: string },
): PaymentEvidence {
  if (!value) throw new Error('Settlement transaction is not available yet.');
  const tx = transactionSchema.parse(value);
  if (tx.transaction.signatures[0] !== expected.signature)
    throw new Error('Settlement signature does not match the accepted receipt.');
  const amount = usdcUnits(expected.amountUsdc);
  const pre = new Map(tx.meta.preTokenBalances.map((item) => [item.accountIndex, item]));
  const post = new Map(tx.meta.postTokenBalances.map((item) => [item.accountIndex, item]));
  if (
    pre.size !== tx.meta.preTokenBalances.length ||
    post.size !== tx.meta.postTokenBalances.length
  )
    throw new Error('Duplicate token balance metadata.');
  const owners = new Map<string, { before: bigint; after: bigint }>();
  const tokenOwners = new Map<string, string>();
  for (const index of new Set([...pre.keys(), ...post.keys()])) {
    const before = pre.get(index),
      after = post.get(index);
    if (before?.mint !== USDC_MINT && after?.mint !== USDC_MINT) continue;
    const owner = after?.owner || before?.owner;
    const key = tx.transaction.message.accountKeys[index]?.pubkey;
    if (!owner || !key) throw new Error('USDC token account owner is missing.');
    for (const entry of [before, after]) {
      if (
        entry &&
        (entry.mint !== USDC_MINT ||
          entry.uiTokenAmount.decimals !== 6 ||
          (entry.owner && entry.owner !== owner) ||
          (entry.programId && entry.programId !== TOKEN_PROGRAM))
      )
        throw new Error('Inconsistent USDC token balance metadata.');
    }
    const beforeUnits = BigInt(before?.uiTokenAmount.amount || '0');
    const afterUnits = BigInt(after?.uiTokenAmount.amount || '0');
    if (beforeUnits > 18_446_744_073_709_551_615n || afterUnits > 18_446_744_073_709_551_615n)
      throw new Error('Invalid token balance.');
    const totals = owners.get(owner) || { before: 0n, after: 0n };
    owners.set(owner, { before: totals.before + beforeUnits, after: totals.after + afterUnits });
    tokenOwners.set(key, owner);
  }
  const seller = owners.get(expected.recipient);
  if (!seller)
    throw new Error('Selected seller payout address is not a recipient in this transaction.');
  if (seller.after - seller.before !== amount)
    throw new Error('Seller USDC delta does not match the order price.');
  const debited = [...owners].filter(([, balances]) => balances.after < balances.before);
  if (debited.length !== 1 || debited[0][1].after - debited[0][1].before !== -amount)
    throw new Error('Cannot identify an exact buyer USDC debit for this order.');
  const [buyerAddress, buyer] = debited[0];
  if (!tx.transaction.message.accountKeys.some((key) => key.pubkey === buyerAddress && key.signer))
    throw new Error('Buyer token owner did not sign the settlement.');
  const instructions = [
    ...tx.transaction.message.instructions,
    ...(tx.meta.innerInstructions || []).flatMap((entry) => entry.instructions),
  ];
  const transfer = instructions.some((instruction) => {
    if (instruction.programId !== TOKEN_PROGRAM) return false;
    const parsed = transferSchema.safeParse(instruction.parsed);
    if (!parsed.success) return false;
    const info = parsed.data.info;
    return (
      info.mint === USDC_MINT &&
      info.tokenAmount.amount === amount.toString() &&
      info.authority === buyerAddress &&
      tokenOwners.get(info.source) === buyerAddress &&
      tokenOwners.get(info.destination) === expected.recipient
    );
  });
  if (!transfer) throw new Error('No matching buyer-to-seller USDC transfer was found.');
  if (
    !instructions.some(
      (instruction) =>
        instruction.programId === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr' &&
        instruction.parsed === expected.orderId,
    )
  )
    throw new Error('Settlement memo does not match this order.');
  return {
    network: 'pay-sandbox',
    signature: expected.signature,
    mint: USDC_MINT,
    slot: tx.slot,
    buyerAddress,
    sellerAddress: expected.recipient,
    amountUsdc: decimalUsdc(amount),
    buyerBalanceBefore: decimalUsdc(buyer.before),
    buyerBalanceAfter: decimalUsdc(buyer.after),
    buyerDelta: decimalUsdc(buyer.after - buyer.before),
    sellerBalanceBefore: decimalUsdc(seller.before),
    sellerBalanceAfter: decimalUsdc(seller.after),
    sellerDelta: decimalUsdc(seller.after - seller.before),
    verifiedAt: new Date().toISOString(),
  };
}
