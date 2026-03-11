/**
 * Browser E2E Test: Assistant - Save Plugin, Install, Uninstall
 *
 * Tests:
 * - Generate proposal → Save as Plugin
 * - Navigate to /plugins → plugin visible
 * - Install → command created
 * - Uninstall → command removed
 * - Delete plugin
 */

import { test, expect, Page } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const TEST_PORT = 3596;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '../..');

let serverProcess: ChildProcess | null = null;
let tempStateDir: string;
let tempProjectDir: string;
let tempGlobalDir: string;

async function startServer(): Promise<void> {
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-plugin-state-'));
  tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-plugin-project-'));
  tempGlobalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-plugin-global-'));

  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'commands'), { recursive: true });

  return new Promise((resolve, reject) => {
    const script = `
      const { createApp } = require('./src/web/server');
      const { InMemoryQueueStore } = require('./src/queue/in-memory-queue-store');

      const queueStore = new InMemoryQueueStore({ namespace: 'pw-plugin' });
      const app = createApp({
        queueStore,
        sessionId: 'pw-plugin-session',
        namespace: 'pw-plugin',
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

// ─── Plugin: Save, Install, Uninstall ───────────────────────────

test('Plugin flow: propose → save as plugin → listed at /plugins', async ({ page }) => {
  // Step 1: Generate proposal
  await page.goto(`${BASE_URL}/assistant?mock=true`);
  await page.waitForSelector('[data-testid="assistant-input"]');

  await page.fill('[data-testid="assistant-input"]', 'Create a test command for plugins');
  await page.click('[data-testid="assistant-send-btn"]');

  await expect(page.locator('[data-testid="proposal-card"]').first()).toBeVisible({ timeout: 10000 });

  // Step 2: Save as Plugin
  await page.click('[data-testid="save-plugin-btn"]');

  // Confirm dialog with name input should appear
  const overlay = page.locator('.confirm-dialog-overlay');
  await overlay.waitFor({ state: 'visible', timeout: 5000 });

  // Fill in plugin name
  const nameInput = overlay.locator('[data-testid="plugin-save-name-input"]');
  await nameInput.clear();
  await nameInput.fill('Test Plugin');

  // Confirm save
  await overlay.locator('[data-action="confirm"]').click();
  await overlay.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});

  await waitForToast(page, 'saved successfully');

  // Step 3: Navigate to /plugins
  await page.goto(`${BASE_URL}/plugins`);
  await page.waitForSelector('[data-testid="plugins-list"]');

  // Plugin should be listed
  await expect(page.locator('[data-testid="plugin-item"]').first()).toBeVisible({ timeout: 5000 });
  await expect(page.locator('[data-testid="plugin-item"]').first()).toContainText('Test Plugin');
});

test('Plugin flow: install → command created, uninstall → command removed', async ({ page }) => {
  // First create a plugin via API
  const pluginResp = await page.request.post(`${BASE_URL}/api/assistant/plugins`, {
    data: {
      name: 'Install Test Plugin',
      description: 'Plugin for install test',
      choice: {
        choiceId: 'test-choice',
        title: 'Install Test Plugin',
        summary: 'Creates a test command',
        scope: 'project',
        artifacts: [
          {
            kind: 'command',
            name: 'plugin-test-cmd',
            targetPathHint: '.claude/commands/plugin-test-cmd.md',
            content: '# Plugin Test Command\n\nThis was installed by a plugin.',
          },
        ],
        applySteps: ['Create command file'],
        rollbackSteps: ['Delete command file'],
        riskNotes: [],
        questions: [],
      },
    },
  });
  expect(pluginResp.ok()).toBeTruthy();
  const plugin = await pluginResp.json();

  // Navigate to /plugins
  await page.goto(`${BASE_URL}/plugins`);
  await page.waitForSelector('[data-testid="plugins-list"]');
  await expect(page.locator('[data-testid="plugin-item"]').first()).toBeVisible({ timeout: 5000 });

  // Click Install
  await page.click('[data-testid="plugin-install-btn"]');
  await confirmDialog(page);
  await waitForToast(page, 'installed');

  // Verify command was created on disk
  const cmdPath = path.join(tempProjectDir, '.claude', 'commands', 'plugin-test-cmd.md');
  expect(fs.existsSync(cmdPath)).toBe(true);
  const cmdContent = fs.readFileSync(cmdPath, 'utf-8');
  expect(cmdContent).toContain('Plugin Test Command');

  // Navigate to /commands to verify visibility
  await page.goto(`${BASE_URL}/commands`);
  await page.waitForSelector('[data-testid="cmd-two-pane"]', { timeout: 5000 });
  await expect(page.locator('[data-testid="cmd-item-plugin-test-cmd"]')).toBeVisible({ timeout: 5000 });

  // Go back to plugins and uninstall
  await page.goto(`${BASE_URL}/plugins`);
  await page.waitForSelector('[data-testid="plugins-list"]');
  await expect(page.locator('[data-testid="plugin-item"]').first()).toBeVisible({ timeout: 5000 });

  await page.click('[data-testid="plugin-uninstall-btn"]');
  await confirmDialog(page);
  await waitForToast(page, 'uninstalled');

  // Verify command was removed from disk
  expect(fs.existsSync(cmdPath)).toBe(false);
});

test('Plugin flow: delete plugin', async ({ page }) => {
  // Create a plugin via API
  const pluginResp = await page.request.post(`${BASE_URL}/api/assistant/plugins`, {
    data: {
      name: 'Delete Test Plugin',
      description: 'Will be deleted',
      choice: {
        choiceId: 'del-choice',
        title: 'Delete Test',
        summary: 'To be deleted',
        scope: 'project',
        artifacts: [],
        applySteps: [],
        rollbackSteps: [],
        riskNotes: [],
        questions: [],
      },
    },
  });
  expect(pluginResp.ok()).toBeTruthy();

  await page.goto(`${BASE_URL}/plugins`);
  await page.waitForSelector('[data-testid="plugins-list"]');
  await expect(page.locator('[data-testid="plugin-item"]').filter({ hasText: 'Delete Test Plugin' })).toBeVisible({ timeout: 5000 });

  // Delete
  const deleteBtn = page.locator('[data-testid="plugin-item"]').filter({ hasText: 'Delete Test Plugin' }).locator('[data-testid="plugin-delete-btn"]');
  await deleteBtn.click();
  await confirmDialog(page);
  await waitForToast(page, 'deleted');

  // Verify it's gone
  await expect(page.locator('[data-testid="plugin-item"]').filter({ hasText: 'Delete Test Plugin' })).toBeHidden({ timeout: 5000 });
});
