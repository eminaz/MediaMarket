import { createServer } from 'node:http';
import { hostname } from 'node:os';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { localMusicConfig, generateLocalMusic } from './local-music';
import { renderMockMusic } from '../src/lib/audio';
import { renderMockImage } from '../src/lib/mock-image';
import type { WorkerAssignment } from '../src/lib/workers';
import { demoSeller, demoToken } from './demo-defaults';
import { localGeneratorConfig, buildGenerationPrompt, generateLocalImage } from './local-generator';

// Worker settings are separate from the marketplace's .env.local.
try {
  process.loadEnvFile('.env.worker');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
const marketplace = new URL(process.env.MARKETPLACE_URL || 'http://localhost:3001').origin;
const seller = process.env.SELLER_HANDLE || demoSeller;
const token = process.env.SELLER_WORKER_TOKEN || demoToken;
const workerName = process.env.WORKER_NAME || `${seller} / ${hostname()}`;
const port = Number(process.env.WORKER_PORT || 4001);
const outputDir = path.resolve(process.env.WORKER_OUTPUT_DIR || 'worker-data');
const delayMs = Number(process.env.WORKER_DEMO_DELAY_MS || 6000);
const generator = await localGeneratorConfig();
const musicGenerator = await localMusicConfig();
let activeGeneration: AbortController | null = null;
if (token.length < 16)
  throw new Error(
    'Set SELLER_WORKER_TOKEN to the seller token configured on the marketplace (at least 16 characters).',
  );
if (
  !Number.isInteger(port) ||
  port < 1 ||
  port > 65535 ||
  !Number.isFinite(delayMs) ||
  delayMs < 0 ||
  delayMs > 120_000
)
  throw new Error('Invalid worker port or demo delay.');
if (workerName.length < 2 || workerName.length > 60)
  throw new Error('WORKER_NAME must be 2–60 characters.');
await mkdir(outputDir, { recursive: true });
const dashboard = await readFile(new URL('./worker-dashboard.html', import.meta.url));
const state = {
  workerName,
  seller,
  marketplace,
  paused: false,
  connected: false,
  phase: 'Connecting',
  renderer: generator ? 'Local AI model' : 'Mock compositor',
  generationMode: generator ? 'local' : 'mock',
  currentJob: null as { id: string; style: string; brief: string } | null,
  lastOutput: null as string | null,
  lastOutputType: 'image' as 'image' | 'music',
  musicRenderer: musicGenerator ? 'Local music model' : 'Mock synthesizer',
  completed: 0,
  events: [] as { time: string; message: string }[],
};
function log(message: string) {
  state.events.unshift({ time: new Date().toISOString(), message });
  state.events = state.events.slice(0, 60);
  console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
}
const headers = { Authorization: `Bearer ${token}`, 'x-seller-handle': seller };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function request(route: string, options: RequestInit = {}, claimToken?: string) {
  const response = await fetch(`${marketplace}${route}`, {
    ...options,
    headers: {
      ...headers,
      ...(claimToken ? { 'x-claim-token': claimToken } : {}),
      ...options.headers,
    },
    signal: AbortSignal.timeout(20_000),
    redirect: 'error',
  });
  if (!response.ok) {
    const message = await response.json().catch(() => ({}));
    throw new Error(message.error || `Marketplace returned HTTP ${response.status}`);
  }
  return response;
}
let stopped = false;
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'GET' && pathname === '/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(dashboard);
    return;
  }
  if (req.method === 'GET' && pathname === '/api/status') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(state));
    return;
  }
  if (req.method === 'POST' && pathname === '/api/toggle') {
    if (req.headers.origin !== `http://${req.headers.host}`) {
      res.writeHead(403).end();
      return;
    }
    state.paused = !state.paused;
    if (!state.currentJob) state.phase = state.paused ? 'Paused' : 'Waiting for a job';
    log(
      state.paused
        ? 'Paused. An active job will finish; new jobs will wait.'
        : 'Resumed. Listening for this seller’s orders.',
    );
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ paused: state.paused }));
    return;
  }
  if (
    req.method === 'GET' &&
    pathname === (state.lastOutputType === 'music' ? '/output.wav' : '/output.png') &&
    state.lastOutput
  ) {
    try {
      res.setHeader('Content-Type', state.lastOutputType === 'music' ? 'audio/wav' : 'image/png');
      res.end(
        await readFile(
          path.join(
            outputDir,
            `${state.lastOutput}.${state.lastOutputType === 'music' ? 'wav' : 'png'}`,
          ),
        ),
      );
    } catch {
      res.writeHead(404).end();
    }
    return;
  }
  res.writeHead(404).end('Not found');
});
server.listen(port, '127.0.0.1', () => {
  log(`Seller dashboard: http://localhost:${port}`);
  log(`Serving @${seller}. Rendering locally on ${hostname()}.`);
  log(musicGenerator ? 'Local music model enabled.' : 'Music: demo synthesizer (no local model).');
  log(
    generator
      ? `Local model enabled: ${generator.width}×${generator.height}, ${generator.steps} steps, seed ${generator.seed}.`
      : 'Mock compositor enabled. No local model is running.',
  );
});
server.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
async function work(assignment: WorkerAssignment) {
  const { job, claimToken, workflowPrompt } = assignment;
  const route = `/api/worker/jobs/${job.id}`;
  const music = job.style.type === 'music';
  const local = music ? !!musicGenerator : !!generator;
  const extension = music ? 'wav' : 'png';
  state.currentJob = { id: job.id, style: job.style.name, brief: job.buyerBrief };
  let leaseLost = false;
  let heartbeatBusy = false;
  activeGeneration = new AbortController();
  const heartbeat = setInterval(async () => {
    if (heartbeatBusy || leaseLost) return;
    heartbeatBusy = true;
    try {
      await request(`${route}/heartbeat`, { method: 'POST' }, claimToken);
    } catch {
      leaseLost = true;
      activeGeneration?.abort();
      log('Lost contact with the marketplace. This claim will expire if delivery cannot finish.');
    } finally {
      heartbeatBusy = false;
    }
  }, 10_000);
  try {
    state.phase = 'Preparing text prompt';
    log(`Claimed ${job.id.slice(0, 8)} · ${job.style.name}`);
    if (generator && job.inputImageUrl)
      throw new Error(
        'This local model worker supports text-to-image only. Create a new order with a text brief.',
      );
    state.phase = local
      ? music
        ? 'Generating music with local AI'
        : 'Generating with local AI'
      : music
        ? 'Synthesizing demo music'
        : 'Composing a mock image';
    log(
      local
        ? 'Brief received. Running the local model with the seller’s private style recipe.'
        : music
          ? 'Brief received. Synthesizing demo music locally.'
          : 'Brief received. Composing the image locally in mock mode.',
    );
    let output: Buffer;
    if (music) {
      const duration = job.style.durationSeconds || 10;
      const prompt = `${workflowPrompt}\nBuyer brief: ${job.buyerBrief}${job.brandName ? `\nProject: ${job.brandName}` : ''}`;
      output = musicGenerator
        ? await generateLocalMusic(
            musicGenerator,
            prompt,
            duration,
            path.join(outputDir, `${job.id}-${randomUUID()}.wav`),
            activeGeneration.signal,
          )
        : renderMockMusic(duration, prompt);
    } else if (generator) {
      output = await generateLocalImage(
        generator,
        buildGenerationPrompt(workflowPrompt, job.buyerBrief, job.brandName),
        path.join(outputDir, `${job.id}-${randomUUID()}.png`),
        activeGeneration.signal,
      );
    } else {
      const input = job.inputImageUrl
        ? Buffer.from(await (await request(`${route}/input`, {}, claimToken)).arrayBuffer())
        : null;
      await sleep(delayMs);
      activeGeneration.signal.throwIfAborted();
      output = await renderMockImage({
        inputImage: input,
        buyerBrief: job.buyerBrief,
        brandName: job.brandName,
        styleListing: job.style,
      });
    }
    await writeFile(path.join(outputDir, `${job.id}.${extension}`), output);
    if (leaseLost)
      throw new Error(
        'Connection was interrupted; output is saved locally, and the job can be reclaimed.',
      );
    state.phase = 'Uploading result';
    log(`${extension.toUpperCase()} rendered on this machine. Uploading the finished creation…`);
    const form = new FormData();
    form.set('generationMode', local ? 'local' : 'mock');
    form.set(
      music ? 'audio' : 'image',
      new Blob([new Uint8Array(output)], { type: music ? 'audio/wav' : 'image/png' }),
      `output.${extension}`,
    );
    // Completion is idempotent, so a lost response can be retried without a second delivery.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await request(`${route}/complete`, { method: 'POST', body: form }, claimToken);
        break;
      } catch (error) {
        if (attempt === 2) throw error;
        await sleep(1000);
      }
    }
    state.completed++;
    state.lastOutput = job.id;
    state.lastOutputType = music ? 'music' : 'image';
    log(`Delivered ${job.id.slice(0, 8)}. The buyer can now download the creation.`);
  } catch (error) {
    log(`Job interrupted: ${(error as Error).message}`);
    await request(`${route}/fail`, { method: 'POST' }, claimToken).catch(() => {});
  } finally {
    clearInterval(heartbeat);
    activeGeneration = null;
    state.currentJob = null;
    state.phase = state.paused ? 'Paused' : 'Waiting for a job';
  }
}
async function poll() {
  let lastError = '';
  while (!stopped) {
    if (!state.paused) {
      try {
        const response = await request('/api/worker/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workerName }),
        });
        const { assignment } = (await response.json()) as { assignment: WorkerAssignment | null };
        if (!state.connected) log('Connected to marketplace. Ready for paid orders.');
        state.connected = true;
        lastError = '';
        state.phase = 'Waiting for a job';
        if (assignment) await work(assignment);
      } catch (error) {
        state.connected = false;
        state.phase = 'Marketplace unavailable';
        const message = (error as Error).message;
        if (message !== lastError) log(`Connection issue: ${message}. Retrying automatically.`);
        lastError = message;
      }
    }
    await sleep(2000);
  }
}
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    stopped = true;
    activeGeneration?.abort();
    log('Worker stopping. Unfinished jobs can be reclaimed after the lease expires.');
    server.close();
    setTimeout(() => process.exit(0), 2500);
  });
void poll();
