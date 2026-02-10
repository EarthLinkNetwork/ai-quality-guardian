import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for UI E2E tests.
 * These tests verify actual browser rendering, not just HTML content.
 */
export default defineConfig({
  testDir: './test/playwright',
  fullyParallel: false, // Run sequentially to avoid port conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker to prevent port conflicts
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  timeout: 60000, // 60 seconds per test
  expect: {
    timeout: 10000,
  },
  use: {
    baseURL: 'http://localhost:3599', // Dedicated port for Playwright tests
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
  // Web server is started by the test setup, not here
  // This prevents port conflicts with other tests
});
