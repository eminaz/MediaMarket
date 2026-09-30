import { parseArgs, promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import path from 'node:path';
import type { AgentOrderView } from '../src/lib/agent-orders';
import { PAY_SANDBOX_RPC } from '../src/lib/payment-mode';

// An HTTP-only reference client. No marketplace DB, browser, model, or seller credentials.
try {
  process.loadEnvFile('.env.agent');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      budget: { type: 'string', default: '5' },
      tags: { type: 'string' },
      brand: { type: 'string' },
      style: { type: 'string' },
      marketplace: { type: 'string' },
      output: { type: 'string' },
      timeout: { type: 'string', default: '300' },
      'request-id': { type: 'string' },
      job: { type: 'string' },
      open: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(`Usage: npm run agent -- "Your image prompt" [--open]
Defaults: budget 5 USDC, marketplace http://localhost:3001, wait up to 300 seconds.
Optional: --budget 3 --tags luxury,minimal --brand AURA --style luxury-product-ad
          --marketplace http://BUYER_IP:3001 --output ./image.png --timeout 120
          --request-id unique-order-key --job existing-job-id
Uses the marketplace payment mode: simulated, or real pay.sh sandbox test payments.
Sandbox requires the pay CLI. Progress goes to stderr; the final result is JSON on stdout.
No LLM is bundled: this client demonstrates the HTTP workflow for external agents.`);
    return;
  }
  if (
    positionals.length > 1 ||
    (!values.job && !positionals[0]) ||
    (values.job && positionals.length)
  )
    throw new Error(
      'Provide one quoted prompt, or --job <id> to resume an existing order. See --help.',
    );
  const budget = Number(values.budget),
    timeout = Number(values.timeout);
  if (!Number.isFinite(budget) || budget < 0.01 || budget > 10000)
    throw new Error('Budget must be 0.01–10,000 USDC.');
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 3600)
    throw new Error('Timeout must be 1–3600 seconds.');
  const marketplace = new URL(
    values.marketplace || process.env.MARKETPLACE_URL || 'http://localhost:3001',
  );
  if (!['http:', 'https:'].includes(marketplace.protocol))
    throw new Error('Marketplace must use HTTP or HTTPS.');
  const origin = marketplace.origin;
  const deadline = Date.now() + timeout * 1000;
  let job: AgentOrderView | undefined;
  const resolveUrl = (route: string) => {
    const url = new URL(route, origin);
    if (url.origin !== origin) throw new Error('The marketplace returned a URL on another origin.');
    return url.href;
  };
  function timeLeft() {
    const remaining = deadline - Date.now();
    if (remaining <= 0)
      throw new Error(
        `Timed out waiting. The order is not cancelled.${job ? ` Resume: npm run agent -- --job ${job.jobId}` : ' Retry with the same request ID.'}`,
      );
    return remaining;
  }
  async function request(route: string, options: RequestInit = {}) {
    const response = await fetch(resolveUrl(route), {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(Math.min(timeLeft(), 180_000)),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Marketplace returned HTTP ${response.status}`);
    }
    return response;
  }
  if (values.job) {
    job = (await (
      await request(`/api/agent/orders/${encodeURIComponent(values.job)}`)
    ).json()) as AgentOrderView;
  } else {
    const manifest = await (await request('/api/agent')).json();
    if (!['simulated', 'pay-sandbox'].includes(manifest.paymentMode))
      throw new Error('Unsupported payment mode. This client never pays on mainnet.');
    const requestId = values['request-id'] || randomUUID();
    console.error(`Request ID: ${requestId} (reuse --request-id after a lost response)`);
    const discovery = await (await request(`/api/agent/styles?budget=${budget}`)).json();
    console.error(
      `Found ${discovery.styles.length} eligible styles within ${budget.toFixed(2)} USDC. Choosing from your brief…`,
    );
    job = (await (
      await request('/api/agent/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestId },
        body: JSON.stringify({
          prompt: positionals[0],
          budget,
          payment: manifest.paymentMode,
          desiredTags: values.tags
            ?.split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
          brandName: values.brand,
          styleListingId: values.style,
        }),
      })
    ).json()) as AgentOrderView;
  }
  console.error(
    `${job.style?.name} by @${job.style?.seller.handle} · ${job.payment.amountUsdc.toFixed(2)} ${job.payment.mode} USDC`,
  );
  console.error(job.decisionReason);
  console.error(`View: ${resolveUrl(job.viewUrl)}`);
  if (job.payment.status === 'pending') {
    if (job.payment.mode !== 'pay-sandbox' || !job.paymentUrl)
      throw new Error('Complete payment on the saved order before resuming.');
    console.error('Paying with pay.sh --sandbox. Test USDC only; waiting for verified settlement…');
    try {
      await promisify(execFile)(
        'pay',
        [
          '--sandbox',
          'curl',
          '--silent',
          '--show-error',
          '--fail-with-body',
          '-X',
          'POST',
          resolveUrl(job.paymentUrl),
        ],
        {
          timeout: Math.min(timeLeft(), 180_000),
          maxBuffer: 2 * 1024 * 1024,
          env: { ...process.env, PAY_RPC_URL: PAY_SANDBOX_RPC },
        },
      );
    } catch (error) {
      const details = error as Error & { code?: string; stderr?: string };
      throw new Error(
        `${details.code === 'ENOENT' ? 'Install pay first: brew install pay (or npm install -g @solana/pay).' : `Sandbox payment did not complete: ${details.stderr?.slice(-600) || details.message}`} Your order is saved. Check ${resolveUrl(job.viewUrl)} before resuming with --job ${job.jobId}.`,
      );
    }
    job = (await (await request(job.statusUrl)).json()) as AgentOrderView;
    if (job.payment.status !== 'confirmed')
      throw new Error(
        'Payment remains pending. Resume the saved order; generation has not been authorized.',
      );
    console.error(`Pay sandbox confirmed: ${job.payment.receipt?.transaction}`);
  }
  let lastStatus = '';
  while (job.status !== 'delivered') {
    if (job.status !== lastStatus) {
      console.error(`Status: ${job.status}${job.workerName ? ` on ${job.workerName}` : ''}`);
      lastStatus = job.status;
    }
    if (job.status === 'failed')
      throw new Error(
        `${job.error || 'Generation failed.'} Retry this saved order at ${resolveUrl(job.viewUrl)}, then resume with --job ${job.jobId}.`,
      );
    if (job.advanceUrl) await request(job.advanceUrl, { method: 'POST' });
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(job!.pollAfterMs || 2000, timeLeft())),
    );
    job = (await (await request(job.statusUrl)).json()) as AgentOrderView;
  }
  if (!job.downloadUrl) throw new Error('Delivered order has no downloadable image.');
  const response = await request(job.downloadUrl);
  const image = Buffer.from(await response.arrayBuffer());
  if (
    image.length > 10 * 1024 * 1024 ||
    !image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw new Error('Expected a PNG image no larger than 10 MB.');
  // Only our own safe filename or an explicit user path can choose a destination.
  const safeId = job.jobId.replace(/[^a-zA-Z0-9-]/g, '_');
  const imagePath = path.resolve(values.output || path.join('agent-output', `${safeId}.png`));
  await mkdir(path.dirname(imagePath), { recursive: true });
  await writeFile(imagePath, image);
  console.error(`Delivered. Saved image on this laptop: ${imagePath}`);
  console.log(
    JSON.stringify(
      {
        jobId: job.jobId,
        status: job.status,
        imagePath,
        imageUrl: resolveUrl(job.outputImageUrl!),
        viewUrl: resolveUrl(job.viewUrl),
        seller: job.style?.seller.handle,
        priceUsdc: job.payment.amountUsdc,
        paymentMode: job.payment.mode,
        paymentReceipt: job.payment.receipt,
        generationMode: job.generationMode,
      },
      null,
      2,
    ),
  );
  if (values.open) {
    const command =
      process.platform === 'darwin'
        ? 'open'
        : process.platform === 'win32'
          ? 'explorer.exe'
          : 'xdg-open';
    const viewer = spawn(command, [imagePath], { stdio: 'ignore', detached: true, shell: false });
    viewer.on('error', () =>
      console.error(`Could not open the image viewer. Open ${imagePath} manually.`),
    );
    viewer.unref();
  }
}
main().catch((error) => {
  console.error(`Agent: ${(error as Error).message}`);
  process.exitCode = 1;
});
