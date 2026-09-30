import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --port 3100',
    url: 'http://127.0.0.1:3100',
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      NEXT_TEST_BUILD: '1',
      PAYMENT_MODE: 'simulated',
      GENERATION_MODE: 'mock',
      EXECUTION_MODE: 'local',
      DATA_DIR: path.resolve('data', `test-${Date.now()}`),
    },
  },
});
