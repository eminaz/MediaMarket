import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
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
  expect(
    (await request.post('/api/worker/claim', { data: { workerName: 'Unauthenticated' } })).status(),
  ).toBe(401);
  await page.goto('/create?style=luxury-product-ad');
  await expect(page.getByText('Seller laptop mode · mock image renderer')).toBeVisible();
  await page.getByRole('button', { name: /Try our sample product/ }).click();
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
    ).toBeVisible({ timeout: 30_000 });
    expect(await readdir(directory)).toEqual(['output']); // The worker has no marketplace SQLite database or shared filesystem.
    expect(await readdir(path.join(directory, 'output'))).toContain(`${id}.png`);
    const job = await (await request.get(`/api/jobs/${id}`)).json();
    expect(job.generationMode).toBe('mock');
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

    const second = await (
      await request.post('/api/jobs', {
        data: {
          styleListingId: 'botanical-editorial',
          inputImageUrl: '/samples/demo-product.png',
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
  } finally {
    worker.kill('SIGTERM');
    if (worker.exitCode === null) await once(worker, 'exit');
    await rm(directory, { recursive: true, force: true });
  }
});
