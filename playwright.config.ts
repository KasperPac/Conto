import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

const PORT = process.env.E2E_PORT ? parseInt(process.env.E2E_PORT) : 3001;
const testDbUrl = process.env.TEST_DATABASE_URL
  ?? process.env.DATABASE_URL?.replace(/\/conto$/, '/conto_test')
  ?? '';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `next dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: testDbUrl,
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
    },
  },
});
