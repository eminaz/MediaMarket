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
        SELLER_GENERATOR: process.env.TEST_LOCAL_GENERATOR === '1' ? 'local' : 'mock',
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
    // A running worker cannot claim the unpaid order.
    await expect
      .poll(async () => {
        try {
          return (await request.get('http://127.0.0.1:4102')).status();
        } catch {
          return 0;
        }
      })
      .toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect((await (await request.get(job.statusUrl)).json()).status).toBe('queued');
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
    const evidence = delivered.paymentReceipt.evidence;
    expect(evidence.signature).toBe(delivered.paymentReceipt.transaction);
    expect(evidence.sellerAddress).toBe(job.style.seller.payoutAddress);
    expect(evidence.buyerDelta).toBe('-2.500000');
    expect(evidence.sellerDelta).toBe('2.500000');
    const balances = (
      entries: Array<{ mint: string; owner: string; uiTokenAmount: { amount: string } }>,
      owner: string,
    ) =>
      entries
        .filter((entry) => entry.mint === evidence.mint && entry.owner === owner)
        .reduce((sum, entry) => sum + BigInt(entry.uiTokenAmount.amount), 0n);
    const decimal = (units: bigint) =>
      `${units / 1000000n}.${(units % 1000000n).toString().padStart(6, '0')}`;
    expect(evidence.buyerBalanceBefore).toBe(
      decimal(balances(chain.result.meta.preTokenBalances, evidence.buyerAddress)),
    );
    expect(evidence.buyerBalanceAfter).toBe(
      decimal(balances(chain.result.meta.postTokenBalances, evidence.buyerAddress)),
    );
    expect(evidence.sellerBalanceBefore).toBe(
      decimal(balances(chain.result.meta.preTokenBalances, evidence.sellerAddress)),
    );
    expect(evidence.sellerBalanceAfter).toBe(
      decimal(balances(chain.result.meta.postTokenBalances, evidence.sellerAddress)),
    );
    expect(stderr).toContain('Payment verified.');
    expect(stderr).toContain('Paid 2.50 test USDC');
    expect(await readFile(delivered.imagePath)).toEqual(
      await (await request.get(delivered.imageUrl)).body(),
    );
    const repeated = await (await request.post(job.paymentUrl)).json();
    expect(repeated.paymentReceipt.transaction).toBe(delivered.paymentReceipt.transaction);
    expect(Date.parse(repeated.workerClaimedAt)).toBeGreaterThanOrEqual(
      Date.parse(evidence.verifiedAt),
    );
    expect(repeated.generationMode).toBe(
      process.env.TEST_LOCAL_GENERATOR === '1' ? 'local' : 'mock',
    );
    const repeatedAgain = await (await request.post(job.paymentUrl)).json();
    expect(repeatedAgain).toEqual(repeated);
    const replayed = await (await request.post('/api/agent/orders', options)).json();
    expect(replayed.jobId).toBe(job.jobId);
    expect(replayed.payment.receipt.transaction).toBe(delivered.paymentReceipt.transaction);
    await expect(page.getByText('Payment settled', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('Sandbox paid', { exact: true })).toBeVisible();
    await expect(page.getByTestId('payment-buyer')).toContainText('-2.50 USDC');
    await expect(page.getByTestId('payment-seller')).toContainText('+2.50 USDC');
    await page.getByText('Transaction & full addresses').click();
    await page.screenshot({ path: 'test-results/pay-sandbox-delivery.png', fullPage: true });
    console.log(
      JSON.stringify(
        {
          ...evidence,
          generationMode: repeated.generationMode,
          workerClaimedAt: repeated.workerClaimedAt,
          outputImageUrl: repeated.outputImageUrl,
        },
        null,
        2,
      ),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  } finally {
    worker.kill('SIGTERM');
    if (worker.exitCode === null) await once(worker, 'exit');
    await rm(directory, { recursive: true, force: true });
  }
});
