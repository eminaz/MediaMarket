import { test, expect } from '@playwright/test';
import { spawn, execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { validateMp4 } from '../../src/lib/video';
const require = createRequire(import.meta.url);

test('buyer agent purchases video, seller renders it locally, and MP4 is delivered to the buyer laptop', async ({
  page,
  request,
}) => {
  test.skip(
    process.env.TEST_PAY_SANDBOX === '1',
    'This test uses simulated checkout; sandbox settlement has a separate suite.',
  );
  const real = process.env.TEST_LOCAL_VIDEO === '1';
  test.setTimeout(real ? 900_000 : 90_000);
  const directory = await mkdtemp(path.join(tmpdir(), 'video-seller-'));
  const buyerDirectory = await mkdtemp(path.join(tmpdir(), 'video-buyer-'));
  const worker = spawn(
    process.execPath,
    ['--import', require.resolve('tsx'), path.resolve('scripts/seller-worker.ts')],
    {
      cwd: directory,
      stdio: 'pipe',
      env: {
        ...process.env,
        MARKETPLACE_URL: 'http://127.0.0.1:3102',
        SELLER_HANDLE: 'studio.aure',
        SELLER_WORKER_TOKEN: 'local-demo-secret-1234',
        WORKER_NAME: 'Independent video seller',
        WORKER_PORT: '4104',
        WORKER_DEMO_DELAY_MS: '0',
        SELLER_GENERATOR: real ? 'local' : 'mock',
        SELLER_MUSIC_GENERATOR: real ? 'local' : 'mock',
        SELLER_VIDEO_GENERATOR: real ? 'local' : 'mock',
        WORKER_OUTPUT_DIR: path.join(directory, 'outputs'),
      },
    },
  );
  let logs = '';
  worker.stdout.on('data', (data) => {
    logs += data;
  });
  worker.stderr.on('data', (data) => {
    logs += data;
  });
  try {
    const cli = [
      '--import',
      require.resolve('tsx'),
      path.resolve('scripts/buyer-agent.ts'),
      'A launch film for a botanical skincare serum. Morning light, glass bottle and green leaves.',
      '--type',
      'video',
      '--brand',
      'AURA',
      '--timeout',
      '840',
      '--request-id',
      `video-demo-${Date.now()}`,
    ];
    const options = {
      cwd: buyerDirectory,
      timeout: real ? 860_000 : 60_000,
      env: { ...process.env, MARKETPLACE_URL: 'http://127.0.0.1:3102' },
    };
    const result = JSON.parse((await promisify(execFile)(process.execPath, cli, options)).stdout);
    expect(result.status).toBe('delivered');
    expect(result.generationMode).toBe(real ? 'local' : 'mock');
    const video = await readFile(result.videoPath);
    expect(validateMp4(video, 15)).toEqual(video);
    expect(video).toEqual(await readFile(path.join(directory, 'outputs', `${result.jobId}.mp4`)));
    expect(video).toEqual(await (await request.get(result.videoUrl)).body());
    expect(await readdir(path.join(directory, 'outputs'))).toEqual([`${result.jobId}.mp4`]);
    const replay = JSON.parse((await promisify(execFile)(process.execPath, cli, options)).stdout);
    expect(replay.jobId).toBe(result.jobId);
    await page.goto(result.viewUrl);
    await expect(page.getByLabel('Generated video', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /Download video/ })).toBeVisible();
    await page.screenshot({
      path: `test-results/video-${real ? 'local-ai' : 'worker'}-delivery.png`,
      fullPage: true,
    });
    await page.goto('http://127.0.0.1:4104');
    await expect(page.getByLabel('Latest video generated on this seller machine')).toBeVisible();
    await expect(page.getByText('1 creation delivered', { exact: true })).toBeVisible();
    console.log(
      `Video demo: job=${result.jobId} mode=${result.generationMode} bytes=${video.length} output=${result.videoUrl}`,
    );
  } catch (error) {
    console.error(logs);
    throw error;
  } finally {
    if (worker.exitCode === null) {
      worker.kill('SIGTERM');
      await once(worker, 'exit');
    }
    await rm(directory, { recursive: true, force: true });
    await rm(buyerDirectory, { recursive: true, force: true });
  }
});
