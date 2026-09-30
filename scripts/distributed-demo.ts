import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const port = process.env.DEMO_PORT || '3001';
const workerPort = process.env.WORKER_PORT || '4001';
const seller = process.env.SELLER_HANDLE || 'studio.aure';
const token = randomBytes(24).toString('hex');
const marketplace = `http://localhost:${port}`;
const common = { ...process.env, GENERATION_MODE: 'mock' };
console.log(
  `\nMarketplace: ${marketplace}\nSeller dashboard: http://localhost:${workerPort}\nSeller: @${seller} · choose Luxury Product Ad or Botanical Editorial for the default seller.\nTwo independent processes, connected over HTTP. Ctrl+C stops both.\n`,
);
const children = [
  spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--port', port], {
    stdio: 'inherit',
    env: {
      ...common,
      EXECUTION_MODE: 'worker',
      SELLER_WORKER_TOKENS: JSON.stringify({ [seller]: token }),
    },
  }),
  spawn(process.execPath, ['--import', 'tsx', 'scripts/seller-worker.ts'], {
    stdio: 'inherit',
    env: {
      ...common,
      MARKETPLACE_URL: marketplace,
      SELLER_HANDLE: seller,
      SELLER_WORKER_TOKEN: token,
      WORKER_NAME: process.env.WORKER_NAME || 'Studio Auré · Seller laptop',
      WORKER_PORT: workerPort,
    },
  }),
];
let stopping = false;
function stop(code: number) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', (code) => stop(code || 0));
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
