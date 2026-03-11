/**
 * Browser E2E Test: Assistant - Propose and Apply
 *
 * Tests:
 * - Navigate to /assistant
 * - Enter prompt, get mock proposal
 * - Preview artifacts
 * - Apply artifacts
 * - Verify created command exists at /commands
 */

import { test, expect, Page } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const TEST_PORT = 3597;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '../..');

let serverProcess: ChildProcess | null = null;
let tempStateDir: string;
let tempProjectDir: string;
let tempGlobalDir: string;

async function startServer(): Promise<void> {
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-assistant-state-'));
  tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-assistant-project-'));
  tempGlobalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-assistant-global-'));

  // Create .claude dirs so apply can write files
  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'commands'), { recursive: true });

  return new Promise((resolve, reject) => {
    const script = `
      const { createApp } = require('./src/web/server');
      const { InMemoryQueueStore } = require('./src/queue/in-memory-queue-store');

      const queueStore = new InMemoryQueueStore({ namespace: 'pw-assistant' });
      const app = createApp({
        queueStore,
        sessionId: 'pw-assistant-session',
        namespace: 'pw-assistant',
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

    serverProcess.stderr?.on('data', (data) => {
      output += data.toString();
    });

    serverProcess.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
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

async function confirmDialog(page: Page) {
  const overlay = page.locator('.confirm-dialog-overlay');
  await overlay.waitFor({ state: 'visible', timeout: 5000 });
  await overlay.locator('[data-action="confirm"]').click();
  await overlay.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
}

async function waitForToast(page: Page, text: string) {
  await expect(page.locator('.toast').filter({ hasText: text }).first()).toBeVisible({ timeout: 5000 });
}

test.beforeAll(async () => {
  await startServer();
});

test.afterAll(async () => {
  await stopServer();
});

// ─── Assistant: Propose and Apply ───────────────────────────────

test('Assistant: navigate to /assistant page', async ({ page }) => {
  await page.goto(`${BASE_URL}/assistant?mock=true`);
  await page.waitForSelector('[data-testid="assistant-input"]');
  await expect(page.locator('[data-testid="assistant-input"]')).toBeVisible();
  await expect(page.locator('[data-testid="assistant-send-btn"]')).toBeVisible();
});

test('Assistant: send prompt → proposal cards appear', async ({ page }) => {
  await page.goto(`${BASE_URL}/assistant?mock=true`);
  await page.waitForSelector('[data-testid="assistant-input"]');

  // Type a prompt
  await page.fill('[data-testid="assistant-input"]', 'Create a test command');
  await page.click('[data-testid="assistant-send-btn"]');

  // Wait for proposal card to appear
  await expect(page.locator('[data-testid="proposal-card"]').first()).toBeVisible({ timeout: 10000 });

  // Verify proposal card has expected elements
  const card = page.locator('[data-testid="proposal-card"]').first();
  await expect(card.locator('.artifact-item')).toBeVisible();
  await expect(card.locator('[data-testid="preview-btn"]')).toBeVisible();
  await expect(card.locator('[data-testid="apply-btn"]')).toBeVisible();
  await expect(card.locator('[data-testid="save-plugin-btn"]')).toBeVisible();
});

test('Assistant: preview shows artifact content', async ({ page }) => {
  await page.goto(`${BASE_URL}/assistant?mock=true`);
  await page.waitForSelector('[data-testid="assistant-input"]');

  await page.fill('[data-testid="assistant-input"]', 'Create a test command');
  await page.click('[data-testid="assistant-send-btn"]');

  await expect(page.locator('[data-testid="proposal-card"]').first()).toBeVisible({ timeout: 10000 });

  // Click Preview
  await page.click('[data-testid="preview-btn"]');

  // Preview section should be visible with content
  const preview = page.locator('.preview-section').first();
  await expect(preview).toBeVisible();
  const previewText = await preview.textContent();
  expect(previewText).toContain('assistant-generated');
});

test('Assistant: apply → files created → visible at /commands', async ({ page }) => {
  await page.goto(`${BASE_URL}/assistant?mock=true`);
  await page.waitForSelector('[data-testid="assistant-input"]');

  await page.fill('[data-testid="assistant-input"]', 'Create a test command');
  await page.click('[data-testid="assistant-send-btn"]');

  await expect(page.locator('[data-testid="proposal-card"]').first()).toBeVisible({ timeout: 10000 });

  // Click Apply
  await page.click('[data-testid="apply-btn"]');

  // Confirm dialog appears
  await confirmDialog(page);

  // Wait for success toast
  await waitForToast(page, 'Applied successfully');

  // Navigate to /commands and verify the command exists
  await page.goto(`${BASE_URL}/commands`);
  await page.waitForSelector('[data-testid="cmd-two-pane"]', { timeout: 5000 });

  // The mock creates 'assistant-generated' command - check it exists
  await expect(page.locator('[data-testid="cmd-item-assistant-generated"]')).toBeVisible({ timeout: 5000 });
});
