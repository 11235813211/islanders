import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYTEST_URL || 'http://127.0.0.1:5173',
    channel: process.platform === 'darwin' ? 'chrome' : undefined,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.PLAYTEST_URL ? undefined : [
    { command: 'npm run dev:server', url: 'http://127.0.0.1:8787/api/health', reuseExistingServer: !process.env.CI, timeout: 60_000 },
    { command: 'npm run dev:web', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, timeout: 30_000 },
  ],
});
