import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for explicit self-update E2E tests.
 * This is intentionally separate from the default Playwright suite
 * so it only runs when explicitly invoked.
 */
export default defineConfig({
  testDir: './test/playwright-selfupdate',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  timeout: 300000, // 5 minutes per test (build + restart)
  expect: {
    timeout: 20000,
  },
  use: {
    baseURL: 'http://localhost:5799',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
