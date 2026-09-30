import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
export default defineConfig({
  testDir: './tests/worker-browser',
  workers: 1,
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:3102', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --port 3102',
    url: 'http://127.0.0.1:3102',
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      GENERATION_MODE: 'mock',
      EXECUTION_MODE: 'worker',
      SELLER_WORKER_TOKENS: JSON.stringify({ 'studio.aure': 'integration-worker-token-1234' }),
      DATA_DIR: path.resolve('data', `worker-test-${Date.now()}`),
    },
  },
});
