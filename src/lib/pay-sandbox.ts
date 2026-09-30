import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createPayKit, Gate, Signer } from '@solana/pay-kit';
import { usd } from '@solana/pay-kit';
import { db, getJob, getStyle, saveJob } from './db';
import { PAY_SANDBOX_RPC, paymentReady } from './payment-mode';
import { USDC_MINT } from './payment-evidence';
import { verifySavedPayment } from './payment-verification';
import type { GenerationJob } from './types';

// This module deliberately has no mainnet or custom-RPC configuration path.
async function rpc(method: string, params: unknown[]) {
  const response = await fetch(PAY_SANDBOX_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json();
  if (!response.ok || body.error)
    throw new Error('Pay sandbox RPC is unavailable. Retry this order later.');
  return body.result;
}
let operatorReady: Promise<Awaited<ReturnType<typeof Signer.demo>>> | undefined;
function operator() {
  operatorReady ??= (async () => {
    const signer = await Signer.demo();
    const balance = await rpc('getBalance', [signer.pubkey, { commitment: 'confirmed' }]);
    if (Number(balance.value) < 5_000_000)
      await rpc('requestAirdrop', [signer.pubkey, 1_000_000_000]);
    return signer;
  })().catch((error) => {
    operatorReady = undefined;
    throw error;
  });
  return operatorReady;
}
function challengeSecret(jobId: string) {
  const conn = db();
  conn
    .prepare('INSERT OR IGNORE INTO payment_state (key, value) VALUES (?, ?)')
    .run('challenge-secret', JSON.stringify(randomBytes(32).toString('hex')));
  const row = conn
    .prepare('SELECT value FROM payment_state WHERE key = ?')
    .get('challenge-secret') as { value: string };
  // Separate HMAC domain per order prevents reusing a proof for a different order.
  return createHmac('sha256', JSON.parse(row.value)).update(jobId).digest('hex');
}
const replayStore = {
  async get(key: string) {
    const row = db()
      .prepare('SELECT value FROM payment_state WHERE key = ?')
      .get(`replay:${key}`) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : null;
  },
  async put(key: string, value: unknown) {
    db()
      .prepare(
        'INSERT INTO payment_state VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(`replay:${key}`, JSON.stringify(value));
  },
  async delete(key: string) {
    db().prepare('DELETE FROM payment_state WHERE key = ?').run(`replay:${key}`);
  },
};
const kits = new Map<
  string,
  Promise<{ kit: Awaited<ReturnType<typeof createPayKit>>; gate: Gate; recipient: string }>
>();
function kitFor(job: GenerationJob) {
  let pending = kits.get(job.id);
  if (!pending) {
    pending = (async () => {
      const recipient = job.payoutAddress!;
      // Fee-sponsored MPP expects the recipient's token account to exist.
      // Bootstrap only missing sandbox accounts; never reset an existing balance.
      const mint = USDC_MINT;
      const accounts = await rpc('getTokenAccountsByOwner', [
        recipient,
        { mint },
        { encoding: 'jsonParsed' },
      ]);
      if (!accounts.value.length)
        await rpc('surfnet_setTokenAccount', [
          recipient,
          mint,
          { amount: 0, state: 'initialized' },
          'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        ]);
      const kit = await createPayKit({
        network: 'solana_localnet',
        rpcUrl: PAY_SANDBOX_RPC,
        accept: ['mpp'],
        stablecoins: ['USDC'],
        operator: { signer: await operator(), recipient, feePayer: true },
        mpp: {
          challengeBindingSecret: challengeSecret(job.id),
          realm: 'Tastemaker sandbox',
          expiresIn: 300,
        },
        replayStore,
      });
      const gate = Gate.create(
        {
          name: job.id,
          externalId: job.id,
          amount: usd(job.priceUsdc.toFixed(2)),
          description: `Tastemaker image order ${job.id}`,
        },
        { accept: ['mpp'], payTo: recipient },
      );
      return { kit, gate, recipient };
    })().catch((error) => {
      kits.delete(job.id);
      throw error;
    });
    if (kits.size >= 100) kits.delete(kits.keys().next().value!);
    kits.set(job.id, pending);
  }
  return pending;
}
export async function paySandboxOrder(request: Request, job: GenerationJob) {
  if (paymentReady(job)) return Response.json(job);
  // Serialize both settlement and receipt-only verification retries.
  const token = randomUUID();
  const lock = db()
    .prepare(
      'INSERT INTO payment_locks VALUES (?, ?, ?) ON CONFLICT(jobId) DO UPDATE SET token=excluded.token, expiresAt=excluded.expiresAt WHERE expiresAt < ?',
    )
    .run(job.id, token, Date.now() + 180_000, Date.now());
  if (!lock.changes)
    return Response.json(
      {
        error: 'Payment verification is already in progress. Poll the saved order before retrying.',
      },
      { status: 409, headers: { 'Retry-After': '2' } },
    );
  try {
    let current = getJob(job.id)!;
    if (paymentReady(current)) return Response.json(current);
    if (!current.payoutAddress) {
      // Preserve a legacy accepted receipt's recipient; snapshot pending orders before advertising.
      current = saveJob({
        ...current,
        payoutAddress:
          current.paymentReceipt?.recipient ||
          getStyle(current.styleListingId)!.seller.payoutAddress,
      });
    }
    if (current.paymentReceipt)
      return Response.json(await verifySavedPayment(job.id, fetchSettlement));
    const { kit, gate, recipient } = await kitFor(current);
    const result = await kit.requirePayment(request, gate);
    if ('respond' in result) return result.respond;
    if (result.status === 402) return result.response;
    if (!result.payment.transaction) throw new Error('Pay returned no settlement transaction.');
    const now = new Date().toISOString();
    saveJob({
      ...getJob(job.id)!,
      paymentStatus: 'pending',
      paymentConfirmedAt: null,
      updatedAt: now,
      paymentReceipt: {
        protocol: 'mpp',
        network: 'pay-sandbox',
        transaction: result.payment.transaction,
        payer: result.payment.payer || null,
        recipient,
        amountUsdc: job.priceUsdc,
        confirmedAt: now,
      },
    });
    const paid = await verifySavedPayment(job.id, fetchSettlement);
    return result.withSettlement(Response.json(paid));
  } finally {
    db().prepare('DELETE FROM payment_locks WHERE jobId = ? AND token = ?').run(job.id, token);
  }
}

async function fetchSettlement(signature: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const transaction = await rpc('getTransaction', [
      signature,
      {
        encoding: 'jsonParsed',
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      },
    ]);
    if (transaction) return transaction;
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    'Settlement is not available from the sandbox RPC yet. Retry verification of this saved order.',
  );
}
