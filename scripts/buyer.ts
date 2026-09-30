import { spawn } from 'node:child_process';
import { demoSeller, demoToken } from './demo-defaults';

try {
  process.loadEnvFile('.env.local');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

const port = process.env.DEMO_PORT || '3001';
const seller = process.env.SELLER_HANDLE || demoSeller;
console.log(`Buyer marketplace: http://localhost:${port}\nStart the seller with: npm run seller`);
const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', '--hostname', '0.0.0.0', '--port', port],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      GENERATION_MODE: 'mock',
      PAYMENT_MODE: process.env.PAYMENT_MODE || 'pay-sandbox',
      EXECUTION_MODE: 'worker',
      SELLER_WORKER_TOKENS:
        process.env.SELLER_WORKER_TOKENS ||
        JSON.stringify({ [seller]: process.env.SELLER_WORKER_TOKEN || demoToken }),
    },
  },
);
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code || 0;
});
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
