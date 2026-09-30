import { test, expect } from '@playwright/test';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);

test('pay.sh sandbox settles test USDC before a seller can deliver', async ({ request, page }) => {
  test.skip(
    process.env.TEST_PAY_SANDBOX !== '1',
    'Opt-in: uses hosted Pay sandbox and installed pay CLI',
  );
  test.setTimeout(240_000);
  const manifest = await (await request.get('/api/agent')).json();
  expect(manifest.paymentMode).toBe('pay-sandbox');
  const body = { prompt: 'A luxury skincare campaign', budget: 5, payment: 'pay-sandbox' };
  const options = { data: body, headers: { 'Idempotency-Key': 'sandbox-payment-integration' } };
  const created = await request.post('/api/agent/orders', options);
  expect(created.status()).toBe(201);
  const job = await created.json();
  expect(job.payment.status).toBe('pending');
  const challenge = await request.post(job.paymentUrl, { timeout: 60_000 });
  expect(challenge.status(), await challenge.text()).toBe(402);
  expect(challenge.headers()['www-authenticate']).toContain('Payment');
  const encodedRequest = challenge.headers()['www-authenticate'].match(/request="([^"]+)"/)![1];
  expect(JSON.parse(Buffer.from(encodedRequest, 'base64url').toString()).amount).toBe('2500000');
  const invalid = await request.post(job.paymentUrl, {
    headers: { Authorization: 'Payment invalid' },
  });
  expect(invalid.status()).toBe(402);
  expect((await (await request.get(job.statusUrl)).json()).payment.status).toBe('pending');
  await page.goto(job.viewUrl);
  await expect(page.getByRole('button', { name: 'Copy pay.sh payment command' })).toBeVisible();
  const directory = await mkdtemp(path.join(tmpdir(), 'pay-sandbox-test-'));
  const worker = spawn(
    process.execPath,
    ['--import', require.resolve('tsx'), path.resolve('scripts/seller-worker.ts')],
    {
      cwd: directory,
      stdio: 'pipe',
      env: {
        ...process.env,
        MARKETPLACE_URL: 'http://127.0.0.1:3102',
        SELLER_HANDLE: '',
        SELLER_WORKER_TOKEN: '',
        SELLER_GENERATOR: 'mock',
        WORKER_NAME: 'Pay sandbox seller',
        WORKER_PORT: '4102',
        WORKER_DEMO_DELAY_MS: '100',
        WORKER_OUTPUT_DIR: path.join(directory, 'seller'),
      },
    },
  );
  worker.stdout.on('data', () => {});
  worker.stderr.on('data', () => {});
  try {
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      [
        '--import',
        require.resolve('tsx'),
        path.resolve('scripts/buyer-agent.ts'),
        '--job',
        job.jobId,
      ],
      {
        cwd: directory,
        timeout: 180_000,
        env: { ...process.env, MARKETPLACE_URL: 'http://127.0.0.1:3102' },
      },
    );
    const delivered = JSON.parse(stdout);
    expect(delivered.paymentMode).toBe('pay-sandbox');
    expect(delivered.paymentReceipt.network).toBe('pay-sandbox');
    expect(delivered.paymentReceipt.transaction).toMatch(/^[1-9A-HJ-NP-Za-km-z]{80,90}$/);
    expect(delivered.paymentReceipt.amountUsdc).toBe(2.5);
    const chain = await (
      await request.post('https://402.surfnet.dev:8899', {
        data: {
          jsonrpc: '2.0',
          id: 1,
          method: 'getTransaction',
          params: [
            delivered.paymentReceipt.transaction,
            { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
          ],
        },
      })
    ).json();
    expect(chain.result.meta.err).toBeNull();
    expect(
      chain.result.transaction.message.instructions.some(
        (instruction: { parsed?: { type: string; info: { tokenAmount?: { amount: string } } } }) =>
          instruction.parsed?.type === 'transferChecked' &&
          instruction.parsed.info.tokenAmount?.amount === '2500000',
      ),
    ).toBe(true);
    expect(stderr).toContain('Pay sandbox confirmed');
    expect(await readFile(delivered.imagePath)).toEqual(
      await (await request.get(delivered.imageUrl)).body(),
    );
    const repeated = await (await request.post(job.paymentUrl)).json();
    expect(repeated.paymentReceipt.transaction).toBe(delivered.paymentReceipt.transaction);
    const replayed = await (await request.post('/api/agent/orders', options)).json();
    expect(replayed.jobId).toBe(job.jobId);
    expect(replayed.payment.receipt.transaction).toBe(delivered.paymentReceipt.transaction);
    await expect(page.getByText('Pay.sh sandbox receipt', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('Sandbox paid', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'test-results/pay-sandbox-delivery.png', fullPage: true });
    console.log(`Verified pay.sh sandbox transaction: ${delivered.paymentReceipt.transaction}`);
  } finally {
    worker.kill('SIGTERM');
    if (worker.exitCode === null) await once(worker, 'exit');
    await rm(directory, { recursive: true, force: true });
  }
});
