/**
 * Browser E2E Test: Settings page per-card save buttons (Batch 1)
 *
 * Validates the UX restructure described in spec/19_WEB_UI.md
 * "Settings ページ: カード別セーブ構造".
 *
 * Covers:
 *   1. Default LLM Configuration card has its own save button and
 *      persists provider/model via PUT /api/settings/project.
 *   2. Default Generation Parameters card has its own save button.
 *   3. Internal LLM card keeps its existing save button.
 *   4. The legacy "Save Global Settings" omnibus button is no longer
 *      rendered at the bottom of the page.
 */

import { test, expect, Page } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const TEST_PORT = 3620;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '../..');

let serverProcess: ChildProcess | null = null;
let tempStateDir: string;
let tempProjectDir: string;
let tempGlobalDir: string;

async function startServer(): Promise<void> {
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-settings-save-state-'));
  tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-settings-save-proj-'));
  tempGlobalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-settings-save-global-'));

  fs.mkdirSync(path.join(tempProjectDir, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(tempGlobalDir), { recursive: true });

  return new Promise((resolve, reject) => {
    const script = `
      const { createApp } = require('./src/web/server');
      const { InMemoryQueueStore } = require('./src/queue/in-memory-queue-store');

      const queueStore = new InMemoryQueueStore({ namespace: 'pw-settings-save' });
      const app = createApp({
        queueStore,
        sessionId: 'pw-settings-save-session',
        namespace: 'pw-settings-save',
        projectRoot: '${tempProjectDir.replace(/'/g, "\\'")}',
        stateDir: '${tempStateDir.replace(/'/g, "\\'")}',
        globalClaudeDir: '${tempGlobalDir.replace(/'/g, "\\'")}',
      });

      const server = app.listen(${TEST_PORT}, () => {
        console.log('PLAYWRIGHT_SERVER_READY');
      });

      process.on('SIGTERM', () => { server.close(); process.exit(0); });
    `;

    serverProcess = spawn('npx', ['ts-node', '-e', script], {
      cwd: PROJECT_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' },
    });

    let output = '';
    const timeout = setTimeout(() => {
      reject(new Error('Server start timeout. Output: ' + output));
    }, 30000);

    serverProcess.stdout?.on('data', (data) => {
      output += data.toString();
      if (output.includes('PLAYWRIGHT_SERVER_READY')) {
        clearTimeout(timeout);
        setTimeout(resolve, 500);
      }
    });
    serverProcess.stderr?.on('data', (data) => { output += data.toString(); });
    serverProcess.on('error', (err) => { clearTimeout(timeout); reject(err); });
  });
}

async function stopServer(): Promise<void> {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      serverProcess?.on('exit', () => resolve());
      setTimeout(resolve, 3000);
    });
    serverProcess = null;
  }
  for (const dir of [tempStateDir, tempProjectDir, tempGlobalDir]) {
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

async function confirmDialogIfPresent(page: Page): Promise<void> {
  const overlay = page.locator('.confirm-dialog-overlay');
  try {
    await expect(overlay).toBeVisible({ timeout: 2000 });
    await overlay
      .locator('.confirm-dialog-actions button.btn-primary, .confirm-dialog-actions button.btn-danger')
      .click();
    await expect(overlay).not.toBeVisible({ timeout: 3000 });
  } catch {
    // No confirm dialog was shown; that's fine for buttons without confirmation.
  }
}

async function gotoSettings(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/#/settings`);
  // Settings page renders its cards asynchronously after loading global settings.
  await page.waitForSelector('[data-testid="settings-provider"]', { timeout: 10000 });
}

test.beforeAll(async () => {
  await startServer();
});

test.afterAll(async () => {
  await stopServer();
});

test('Settings: Default LLM Configuration card has its own save button', async ({ page }) => {
  await gotoSettings(page);
  await expect(
    page.locator('[data-testid="settings-save-default-llm"]')
  ).toBeVisible();
});

test('Settings: Default Generation Parameters card has its own save button', async ({ page }) => {
  await gotoSettings(page);
  await expect(
    page.locator('[data-testid="settings-save-default-params"]')
  ).toBeVisible();
});

test('Settings: Internal LLM card keeps its own save button', async ({ page }) => {
  await gotoSettings(page);
  await expect(
    page.locator('button', { hasText: 'Save Internal LLM Settings' })
  ).toBeVisible();
});

test('Settings: omnibus "Save Global Settings" button is removed', async ({ page }) => {
  await gotoSettings(page);
  await expect(
    page.locator('button', { hasText: /^Save Global Settings$/ })
  ).toHaveCount(0);
});

test('Settings: Save on Default LLM card persists provider/model via /api/settings/project', async ({ page }) => {
  await gotoSettings(page);

  // Change provider to openai and model to gpt-4o.
  await page.selectOption('[data-testid="settings-provider"]', 'openai');
  await page.selectOption('[data-testid="settings-model"]', 'gpt-4o');

  await page.click('[data-testid="settings-save-default-llm"]');
  await confirmDialogIfPresent(page);

  // Give the save a moment, then verify via the API.
  await page.waitForTimeout(500);
  const res = await page.request.get(`${BASE_URL}/api/settings/project`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.llm?.provider).toBe('openai');
  expect(body.llm?.model).toBe('gpt-4o');
});
