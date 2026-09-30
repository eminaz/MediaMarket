import { test, expect } from '@playwright/test';
import { spawn, execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);

test('paid order waits for a separate worker, pauses, and delivers over HTTP', async ({
  page,
  request,
  context,
}) => {
  test.setTimeout(process.env.TEST_LOCAL_GENERATOR === '1' ? 180_000 : 90_000);
  expect(
    (await request.post('/api/worker/claim', { data: { workerName: 'Unauthenticated' } })).status(),
  ).toBe(401);
  await page.goto('/create?style=luxury-product-ad');
  await expect(page.getByText('Seller laptop mode · text to image')).toBeVisible();
  await page
    .getByLabel('The brief')
    .fill('A botanical skincare launch, generated on the seller laptop.');
  await page.getByLabel('Brand or subject name').fill('AURA from another machine');
  await page.getByRole('button', { name: 'Find my style' }).click();
  await expect(page.locator('.style-option')).toHaveCount(2);
  await page.getByRole('button', { name: 'Review creation' }).click();
  await page.getByRole('button', { name: 'Pay 2.50 USDC & create' }).click();
  await expect(page).toHaveURL(/\/jobs\/[^/]+$/);
  await expect(page.getByText('Waiting for @studio.aure’s laptop')).toBeVisible();
  const id = page.url().split('/').pop()!;
  await request.post(`/api/jobs/${id}/advance`);
  const queued = await (await request.get(`/api/jobs/${id}`)).json();
  expect(queued.status).toBe('queued');
  expect(queued.outputImageUrl).toBeNull();

  const directory = await mkdtemp(path.join(tmpdir(), 'seller-machine-'));
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
        WORKER_NAME: 'Independent seller laptop',
        WORKER_PORT: '4102',
        WORKER_DEMO_DELAY_MS: '2500',
        SELLER_GENERATOR: process.env.TEST_LOCAL_GENERATOR === '1' ? 'local' : 'mock',
        WORKER_OUTPUT_DIR: path.join(directory, 'output'),
      },
    },
  );
  let output = '';
  worker.stdout.on('data', (data) => {
    output += data;
  });
  worker.stderr.on('data', (data) => {
    output += data;
  });
  try {
    await expect(
      page.getByText('Generated on Independent seller laptop', { exact: true }),
    ).toBeVisible({ timeout: process.env.TEST_LOCAL_GENERATOR === '1' ? 150_000 : 30_000 });
    expect(await readdir(directory)).toEqual(['output']); // The worker has no marketplace SQLite database or shared filesystem.
    expect(await readdir(path.join(directory, 'output'))).toContain(`${id}.png`);
    const job = await (await request.get(`/api/jobs/${id}`)).json();
    expect(job.inputImageUrl).toBeNull();
    expect(job.generationMode).toBe(process.env.TEST_LOCAL_GENERATOR === '1' ? 'local' : 'mock');
    expect(job.executionMode).toBe('worker');
    expect(await (await request.get(job.outputImageUrl)).body()).not.toHaveLength(0);
    const dashboard = await context.newPage();
    await dashboard.goto('http://127.0.0.1:4102');
    await expect(dashboard.getByText('1 image delivered', { exact: true })).toBeVisible();
    await expect(
      dashboard.getByAltText('Latest image generated on this seller machine'),
    ).toBeVisible();
    await dashboard.getByRole('button', { name: 'Pause worker' }).click();
    await expect(dashboard.getByRole('button', { name: 'Resume worker' })).toBeVisible();

    if (process.env.TEST_LOCAL_GENERATOR === '1') {
      await page.screenshot({ path: 'test-results/local-ai-delivery.png', fullPage: true });
      return;
    }
    const second = await (
      await request.post('/api/jobs', {
        data: {
          styleListingId: 'botanical-editorial',
          buyerBrief: 'A second remote botanical campaign.',
          budget: 5,
        },
      })
    ).json();
    await expect
      .poll(
        async () => (await (await request.post(`/api/jobs/${second.id}/pay`)).json()).paymentStatus,
      )
      .toBe('confirmed');
    await expect(dashboard.getByText('Paused', { exact: true })).toBeVisible();
    expect((await (await request.get(`/api/jobs/${second.id}`)).json()).status).toBe('queued');
    await dashboard.getByRole('button', { name: 'Resume worker' }).click();
    await expect(dashboard.getByText('2 images delivered', { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await dashboard.screenshot({
      path: 'test-results/seller-worker-dashboard.png',
      fullPage: true,
    });
    await page.screenshot({ path: 'test-results/worker-delivery.png', fullPage: true });
    expect(output).toContain('Composing the image locally');

    // A third machine: headless buyer agent, no page opened while its order runs.
    const buyerDirectory = await mkdtemp(path.join(tmpdir(), 'buyer-agent-machine-'));
    try {
      const cliArgs = [
        '--import',
        require.resolve('tsx'),
        path.resolve('scripts/buyer-agent.ts'),
        'A luxury skincare bottle on an ivory plinth',
        '--request-id',
        `agent-${id}`,
      ];
      const options = {
        cwd: buyerDirectory,
        timeout: 45_000,
        env: {
          ...process.env,
          MARKETPLACE_URL: 'http://127.0.0.1:3102',
        },
      };
      const { stdout, stderr } = await promisify(execFile)(process.execPath, cliArgs, options);
      const delivered = JSON.parse(stdout);
      expect(delivered.status).toBe('delivered');
      expect(delivered.generationMode).toBe('mock');
      expect(delivered.seller).toBe('studio.aure');
      expect(stderr).toContain('Found 2 eligible styles');
      expect(await readdir(buyerDirectory)).toEqual(['agent-output']);
      const localPng = await readFile(delivered.imagePath);
      expect(localPng).toEqual(await (await request.get(delivered.imageUrl)).body());
      expect(localPng.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const replay = JSON.parse(
        (await promisify(execFile)(process.execPath, cliArgs, options)).stdout,
      );
      expect(replay.jobId).toBe(delivered.jobId);
      const resumed = JSON.parse(
        (
          await promisify(execFile)(
            process.execPath,
            [
              '--import',
              require.resolve('tsx'),
              path.resolve('scripts/buyer-agent.ts'),
              '--job',
              delivered.jobId,
            ],
            options,
          )
        ).stdout,
      );
      expect(resumed.jobId).toBe(delivered.jobId);
      await page.goto(delivered.viewUrl);
      await expect(page.getByText('Ordered by your agent · simulated USDC checkout')).toBeVisible();
      await page.screenshot({ path: 'test-results/agent-delivery.png', fullPage: true });
    } finally {
      await rm(buyerDirectory, { recursive: true, force: true });
    }
  } finally {
    worker.kill('SIGTERM');
    if (worker.exitCode === null) await once(worker, 'exit');
    await rm(directory, { recursive: true, force: true });
  }
});
