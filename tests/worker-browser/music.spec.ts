import { test, expect } from '@playwright/test';
import { spawn, execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { cleanWav } from '../../src/lib/audio';
const require = createRequire(import.meta.url);

test('buyer agent purchases music, seller runs its generator, and WAV is delivered to the buyer laptop', async ({
  page,
  request,
}) => {
  test.skip(
    process.env.TEST_PAY_SANDBOX === '1',
    'This test uses simulated checkout; sandbox settlement has a separate suite.',
  );
  const real = process.env.TEST_LOCAL_MUSIC === '1';
  test.setTimeout(real ? 720_000 : 90_000);
  const directory = await mkdtemp(path.join(tmpdir(), 'music-seller-'));
  const buyerDirectory = await mkdtemp(path.join(tmpdir(), 'music-buyer-'));
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
        WORKER_NAME: 'Independent music seller',
        WORKER_PORT: '4103',
        WORKER_DEMO_DELAY_MS: '0',
        SELLER_GENERATOR: 'mock',
        SELLER_MUSIC_GENERATOR: real ? 'local' : 'mock',
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
      'Minimal luxury ambient music, warm piano, shimmering textures, gentle electronic pulse, no vocals',
      '--type',
      'music',
      '--timeout',
      '660',
      '--request-id',
      `music-demo-${Date.now()}`,
    ];
    const options = {
      cwd: buyerDirectory,
      timeout: real ? 680_000 : 45_000,
      env: { ...process.env, MARKETPLACE_URL: 'http://127.0.0.1:3102' },
    };
    const result = JSON.parse((await promisify(execFile)(process.execPath, cli, options)).stdout);
    expect(result.status).toBe('delivered');
    expect(result.generationMode).toBe(real ? 'local' : 'mock');
    const audio = await readFile(result.audioPath);
    expect(cleanWav(audio, 10)).toEqual(audio);
    expect(audio).toEqual(await readFile(path.join(directory, 'outputs', `${result.jobId}.wav`)));
    expect(audio).toEqual(await (await request.get(result.audioUrl)).body());
    expect(await readdir(path.join(directory, 'outputs'))).toEqual([`${result.jobId}.wav`]);
    const replay = JSON.parse((await promisify(execFile)(process.execPath, cli, options)).stdout);
    expect(replay.jobId).toBe(result.jobId);
    await page.goto(result.viewUrl);
    await expect(page.getByRole('heading', { name: 'Your soundtrack is ready.' })).toBeVisible();
    await expect
      .poll(() =>
        page
          .getByLabel('Generated music', { exact: true })
          .evaluate((el: HTMLAudioElement) => el.duration),
      )
      .toBe(10);
    await page.screenshot({
      path: `test-results/music-${real ? 'local-ai' : 'worker'}-delivery.png`,
      fullPage: true,
    });
    await page.goto('http://127.0.0.1:4103');
    await expect(page.getByLabel('Latest music generated on this seller machine')).toBeVisible();
    await expect(page.getByText('1 creation delivered', { exact: true })).toBeVisible();
    console.log(
      `Music demo: job=${result.jobId} mode=${result.generationMode} bytes=${audio.length} output=${result.audioUrl}`,
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
