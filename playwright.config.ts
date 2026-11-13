import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  // Tests use separate rooms on one local server; CI runs two at a time to finish sooner.
  workers: process.env.CI ? 2 : 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYTEST_URL || 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      // Screenshot-only review tools (no assertions) run by name, not in CI: see AGENTS.md.
      testIgnore: [
        '**/phone.spec.ts',
        ...(process.env.CI ? ['**/visual.spec.ts', '**/art-compare.spec.ts', '**/gesture-perf.spec.ts'] : []),
      ],
      use: { channel: process.platform === 'darwin' ? 'chrome' : undefined, viewport: { width: 1440, height: 1000 } },
    },
    // iPhone emulation (touch, phone viewport). WebKit on Linux/CI; Playwright's WebKit
    // no longer runs on older macOS, so a Mac falls back to Chromium with the same device settings.
    {
      name: 'iphone',
      testMatch: '**/phone.spec.ts',
      use: {
        ...devices['iPhone 13'],
        ...(process.platform === 'darwin' ? { browserName: 'chromium' as const, channel: 'chrome' } : {}),
      },
    },
  ],
  webServer: process.env.PLAYTEST_URL
    ? undefined
    : [
        {
          command: 'npm run dev:server',
          url: 'http://127.0.0.1:8787/api/health',
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
        {
          command: 'npm run dev:web',
          url: 'http://127.0.0.1:5173',
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
        },
      ],
});
