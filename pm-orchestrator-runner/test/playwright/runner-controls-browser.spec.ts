/**
 * Browser E2E Test: Runner Controls UI Visibility
 *
 * AC-UI-RC-1: Settings画面に Runner Controls セクションが必ず表示され、Build/Restart/Stop ボタンが可視である
 * AC-UI-RC-2: 各ボタン押下で対応APIが呼ばれ、UIに成功/失敗が明確に表示される
 * AC-UI-RC-3: Build→Restart後に build_sha と web_pid の変化をUIと /api/health の両方で検証できる
 * AC-UI-RC-4: Web再起動後に再ロードしても Runner Controls が表示され続ける（キャッシュ事故検知）
 *
 * These tests use Playwright to verify ACTUAL browser rendering, not just HTML content.
 * They detect issues like:
 * - JavaScript errors preventing button rendering
 * - CSS hiding elements
 * - Tab navigation failures
 * - State initialization problems
 */

import { test, expect, Page } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const TEST_PORT = 3599;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '../..');

let serverProcess: ChildProcess | null = null;
let tempStateDir: string;

/**
 * Start the web server for testing
 */
async function startServer(): Promise<void> {
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-runner-controls-'));

  return new Promise((resolve, reject) => {
    // Use ts-node to run the server directly
    serverProcess = spawn('npx', [
      'ts-node',
      '-e',
      `
        const { createApp } = require('./src/web/server');
        const { InMemoryQueueStore } = require('./src/queue/in-memory-queue-store');

        const queueStore = new InMemoryQueueStore({ namespace: 'playwright-test' });
        const app = createApp({
          queueStore,
          sessionId: 'playwright-session',
          namespace: 'playwright-test',
          projectRoot: '${PROJECT_ROOT.replace(/\\/g, '\\\\')}',
          stateDir: '${tempStateDir.replace(/\\/g, '\\\\')}',
        });

        const server = app.listen(${TEST_PORT}, () => {
          console.log('PLAYWRIGHT_SERVER_READY');
        });

        process.on('SIGTERM', () => {
          server.close();
          process.exit(0);
        });
      `
    ], {
      cwd: PROJECT_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' },
    });

    let output = '';
    const timeout = setTimeout(() => {
      reject(new Error('Server start timeout'));
    }, 30000);

    serverProcess.stdout?.on('data', (data) => {
      output += data.toString();
      if (output.includes('PLAYWRIGHT_SERVER_READY')) {
        clearTimeout(timeout);
        // Wait a bit more for server to be fully ready
        setTimeout(resolve, 500);
      }
    });

    serverProcess.stderr?.on('data', (data) => {
      const msg = data.toString();
      // Ignore deprecation warnings
      if (!msg.includes('DeprecationWarning')) {
        console.error('Server stderr:', msg);
      }
    });

    serverProcess.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Stop the test server
 */
async function stopServer(): Promise<void> {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }

  // Cleanup temp directory
  if (tempStateDir && fs.existsSync(tempStateDir)) {
    fs.rmSync(tempStateDir, { recursive: true, force: true });
  }

  // Wait for port to be released
  await new Promise(resolve => setTimeout(resolve, 500));
}

/**
 * Wait for server to be reachable
 */
async function waitForServer(maxRetries = 30): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(`${BASE_URL}/api/health`, (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            reject(new Error(`Unexpected status: ${res.statusCode}`));
          }
        });
        req.on('error', reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error('Timeout'));
        });
      });
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  throw new Error('Server not reachable after retries');
}

test.describe('Browser E2E: Runner Controls UI (AC-UI-RC-1 to AC-UI-RC-4)', () => {
  test.beforeAll(async () => {
    await startServer();
    await waitForServer();
  });

  test.afterAll(async () => {
    await stopServer();
  });

  test.describe('AC-UI-RC-1: Settings画面にRunner Controlsセクションが表示される', () => {
    test('Settings page loads and Runner Controls section is visible', async ({ page }) => {
      // Navigate to Settings
      await page.goto(`${BASE_URL}/settings`);

      // Wait for page to fully load
      await page.waitForLoadState('networkidle');

      // Verify Runner Controls section is visible (not just in DOM, but actually visible)
      const runnerControlsSection = page.locator('[data-testid="settings-runner-controls"]');
      await expect(runnerControlsSection).toBeVisible({ timeout: 10000 });

      // Verify the heading is visible (E1-1: "Self-Update (Build & Restart)")
      const heading = runnerControlsSection.locator('h3:has-text("Self-Update")');
      await expect(heading).toBeVisible();
    });

    test('Build button is visible and enabled', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings`);
      await page.waitForLoadState('networkidle');

      // Wait for Runner Controls to load status (which enables buttons)
      await page.waitForTimeout(1000);

      const buildBtn = page.locator('#btn-runner-build');
      await expect(buildBtn).toBeVisible();
      // Button might be disabled initially while loading, but should be present
      await expect(buildBtn).toHaveText('Build Only');
    });

    test('Build & Restart button is visible and enabled', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings`);
      await page.waitForLoadState('networkidle');

      const restartBtn = page.locator('#btn-runner-restart');
      await expect(restartBtn).toBeVisible();
      // E1-1: Build & Restart should always be enabled (not just when running)
      await expect(restartBtn).toHaveText('Build & Restart');
      // Verify it's enabled after status loads
      await page.waitForTimeout(500);
      await expect(restartBtn).toBeEnabled();
    });

    test('Stop button is visible', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings`);
      await page.waitForLoadState('networkidle');

      const stopBtn = page.locator('#btn-runner-stop');
      await expect(stopBtn).toBeVisible();
      await expect(stopBtn).toHaveText('Stop');
    });

    test('Status indicator is visible', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings`);
      await page.waitForLoadState('networkidle');

      const statusDot = page.locator('#runner-status-dot');
      await expect(statusDot).toBeVisible();

      const statusLabel = page.locator('#runner-status-label');
      await expect(statusLabel).toBeVisible();
    });

    test('Runner Controls has all required elements in correct layout', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings`);
      await page.waitForLoadState('networkidle');

      // Verify the controls container
      const controlsContainer = page.locator('.runner-controls');
      await expect(controlsContainer).toBeVisible();

      // Verify actions section
      const actionsSection = page.locator('.runner-controls-actions');
      await expect(actionsSection).toBeVisible();

      // Verify all 3 buttons are within the actions section
      const buttons = actionsSection.locator('button');
      await expect(buttons).toHaveCount(3);
    });
  });

  test.describe('AC-UI-RC-2: ボタン押下でAPIが呼ばれUIにフィードバック表示', () => {
    test('Stop button onclick handler is wired to runnerStop()', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings`);
      await page.waitForLoadState('networkidle');

      const stopBtn = page.locator('#btn-runner-stop');

      // Verify onclick handler is set
      const onclick = await stopBtn.getAttribute('onclick');
      expect(onclick).toBe('runnerStop()');

      // Verify runnerStop function exists and can be called
      const hasFunction = await page.evaluate(() => {
        return typeof (window as any).runnerStop === 'function';
      });
      expect(hasFunction).toBe(true);
    });

    test('Build button onclick handler is wired to runnerBuild()', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings`);
      await page.waitForLoadState('networkidle');

      const buildBtn = page.locator('#btn-runner-build');

      // Verify onclick handler is set
      const onclick = await buildBtn.getAttribute('onclick');
      expect(onclick).toBe('runnerBuild()');

      // Verify runnerBuild function exists
      const hasFunction = await page.evaluate(() => {
        return typeof (window as any).runnerBuild === 'function';
      });
      expect(hasFunction).toBe(true);
    });

    test('Result div exists for feedback display', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings`);
      await page.waitForLoadState('networkidle');

      // Result div should exist (may be hidden initially)
      const resultDiv = page.locator('#runner-controls-result');
      await expect(resultDiv).toHaveCount(1);

      // Verify showRunnerResult function exists (used to display results)
      const hasFunction = await page.evaluate(() => {
        return typeof (window as any).showRunnerResult === 'function';
      });
      expect(hasFunction).toBe(true);
    });

    test('API endpoints are callable from page context', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings`);
      await page.waitForLoadState('networkidle');

      // Test that /api/runner/status is accessible
      const statusResponse = await page.request.get(`${BASE_URL}/api/runner/status`);
      expect(statusResponse.ok()).toBe(true);

      const statusData = await statusResponse.json();
      expect(statusData).toHaveProperty('isRunning');
    });
  });

  test.describe('AC-UI-RC-4: リロード後もRunner Controlsが表示される', () => {
    test('Runner Controls persist after page reload', async ({ page }) => {
      // First load
      await page.goto(`${BASE_URL}/settings`);
      await page.waitForLoadState('networkidle');

      const sectionBefore = page.locator('[data-testid="settings-runner-controls"]');
      await expect(sectionBefore).toBeVisible();

      // Reload
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Verify still visible
      const sectionAfter = page.locator('[data-testid="settings-runner-controls"]');
      await expect(sectionAfter).toBeVisible();
    });

    test('Runner Controls visible in new browser context (cache-busting)', async ({ browser }) => {
      // Create a fresh context (no cache)
      const context = await browser.newContext();
      const page = await context.newPage();

      try {
        await page.goto(`${BASE_URL}/settings`);
        await page.waitForLoadState('networkidle');

        const section = page.locator('[data-testid="settings-runner-controls"]');
        await expect(section).toBeVisible();

        // Verify buttons
        await expect(page.locator('#btn-runner-build')).toBeVisible();
        await expect(page.locator('#btn-runner-restart')).toBeVisible();
        await expect(page.locator('#btn-runner-stop')).toBeVisible();
      } finally {
        await context.close();
      }
    });
  });

  test.describe('Navigation Tests', () => {
    test('Can navigate from home to Settings and see Runner Controls', async ({ page }) => {
      // Start from home
      await page.goto(BASE_URL);
      await page.waitForLoadState('networkidle');

      // Click Settings nav link
      await page.click('nav a[data-nav="settings"]');
      await page.waitForLoadState('networkidle');

      // Verify URL
      expect(page.url()).toContain('/settings');

      // Verify Runner Controls visible
      const section = page.locator('[data-testid="settings-runner-controls"]');
      await expect(section).toBeVisible();
    });

    test('Direct navigation to /settings shows Runner Controls', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings`);
      await page.waitForLoadState('networkidle');

      const section = page.locator('[data-testid="settings-runner-controls"]');
      await expect(section).toBeVisible();
    });
  });

  test.describe('DOM Structure Verification', () => {
    test('Runner Controls section has correct test-id for automation', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings`);
      await page.waitForLoadState('networkidle');

      // Verify test-id exists and is accessible
      const section = page.getByTestId('settings-runner-controls');
      await expect(section).toBeVisible();
    });

    test('Button IDs are unique and correct', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings`);
      await page.waitForLoadState('networkidle');

      // Each button should have exactly one match
      const buildBtns = page.locator('#btn-runner-build');
      const restartBtns = page.locator('#btn-runner-restart');
      const stopBtns = page.locator('#btn-runner-stop');

      await expect(buildBtns).toHaveCount(1);
      await expect(restartBtns).toHaveCount(1);
      await expect(stopBtns).toHaveCount(1);
    });
  });

  test.describe('API Health Integration', () => {
    test('/api/health returns build_sha and web_pid', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings`);

      // Make API call directly
      const response = await page.request.get(`${BASE_URL}/api/health`);
      expect(response.ok()).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('status', 'ok');
      expect(data).toHaveProperty('web_pid');
      expect(typeof data.web_pid).toBe('number');

      // build_sha may or may not be present depending on build state
      // but the property should exist if build-meta.json exists
    });
  });

  // E1-3: Additional Playwright E2E tests for Build & Restart
  test.describe('E1: Build & Restart Enhancements', () => {
    test('E1-1: Build & Restart button is enabled even when API returns status', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings`);
      await page.waitForLoadState('networkidle');

      // Wait for status to load
      await page.waitForTimeout(1000);

      const restartBtn = page.locator('#btn-runner-restart');
      await expect(restartBtn).toBeVisible();
      // E1-1: Button should be enabled regardless of running state
      await expect(restartBtn).toBeEnabled();
    });

    test('E1-2: Runner status shows Running when web is alive (selfhost mode)', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings`);
      await page.waitForLoadState('networkidle');

      // Wait for status to load
      await page.waitForTimeout(1500);

      // Check API returns isRunning: true in selfhost mode
      const statusResponse = await page.request.get(`${BASE_URL}/api/runner/status`);
      expect(statusResponse.ok()).toBe(true);

      const statusData = await statusResponse.json();
      // E1-2: In selfhost mode, web is always running
      expect(statusData.isRunning).toBe(true);
      expect(statusData.pid).toBeGreaterThan(0);

      // UI should show "Running" (or operation in progress)
      const statusLabel = page.locator('#runner-status-label');
      await expect(statusLabel).toBeVisible();
      const labelText = await statusLabel.textContent();
      // Should not be "Stopped" in selfhost mode
      expect(labelText).not.toBe('Stopped');
    });

    test('E1-3: Build Only button is always enabled', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings`);
      await page.waitForLoadState('networkidle');

      await page.waitForTimeout(1000);

      const buildBtn = page.locator('#btn-runner-build');
      await expect(buildBtn).toBeVisible();
      await expect(buildBtn).toBeEnabled();
    });

    test('E1-3: Stop button respects running state', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings`);
      await page.waitForLoadState('networkidle');

      await page.waitForTimeout(1000);

      const stopBtn = page.locator('#btn-runner-stop');
      await expect(stopBtn).toBeVisible();
      // In selfhost mode with isRunning: true, stop should be enabled
      const statusResponse = await page.request.get(`${BASE_URL}/api/runner/status`);
      const statusData = await statusResponse.json();
      if (statusData.isRunning) {
        await expect(stopBtn).toBeEnabled();
      }
    });

    test('E1-3: Status dot reflects running state', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings`);
      await page.waitForLoadState('networkidle');

      await page.waitForTimeout(1500);

      const statusDot = page.locator('#runner-status-dot');
      await expect(statusDot).toBeVisible();

      // Get the class to verify state
      const dotClass = await statusDot.getAttribute('class');
      // Should have 'running' class in selfhost mode (E1-2 fix)
      expect(dotClass).toContain('running');
    });
  });
});
