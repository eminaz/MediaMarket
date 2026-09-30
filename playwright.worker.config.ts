import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
export default defineConfig({
  testDir: './tests/worker-browser',
  workers: 1,
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:3102', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run buyer',
    url: 'http://127.0.0.1:3102',
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      NEXT_TEST_BUILD: '1',
      PAYMENT_MODE: process.env.TEST_PAY_SANDBOX === '1' ? 'pay-sandbox' : 'simulated',
      DEMO_PORT: '3102',
      SELLER_WORKER_TOKENS: '',
      SELLER_WORKER_TOKEN: '',
      SELLER_HANDLE: '',
      DATA_DIR: path.resolve('data', `worker-test-${Date.now()}`),
    },
  },
});
