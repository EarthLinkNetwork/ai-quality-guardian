/**
 * Browser E2E Test: Hooks CRUD (GUI Level Upgrade)
 *
 * Tests:
 * 1. Events tab: create hook event via dropdown, save, persists after reload
 * 2. Events tab: edit hook command, save, reflected
 * 3. Events tab: delete hook event, removed from list
 * 4. Scripts tab: create script, save, listed, persist
 * 5. Scripts tab: delete script
 * 6. Health tab: shows inconsistency when script missing
 */

import { test, expect, Page } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const TEST_PORT = 3598;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '../..');

let serverProcess: ChildProcess | null = null;
let tempStateDir: string;
let tempProjectDir: string;
let tempGlobalDir: string;

async function startServer(): Promise<void> {
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-hooks-state-'));
  tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-hooks-project-'));
  tempGlobalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-hooks-global-'));

  return new Promise((resolve, reject) => {
    const script = `
      const { createApp } = require('./src/web/server');
      const { InMemoryQueueStore } = require('./src/queue/in-memory-queue-store');

      const queueStore = new InMemoryQueueStore({ namespace: 'pw-hooks' });
      const app = createApp({
        queueStore,
        sessionId: 'pw-hooks-session',
        namespace: 'pw-hooks',
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

/** Helper: click a confirm dialog's confirm button */
async function confirmDialog(page: Page) {
  const overlay = page.locator('.confirm-dialog-overlay');
  await overlay.waitFor({ state: 'visible', timeout: 5000 });
  await overlay.locator('[data-action="confirm"]').click();
  await overlay.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
}

/** Helper: wait for toast */
async function waitForToast(page: Page, text: string) {
  await expect(page.locator('.toast').filter({ hasText: text }).first()).toBeVisible({ timeout: 5000 });
}

test.beforeAll(async () => {
  await startServer();
});

test.afterAll(async () => {
  await stopServer();
});

// ─── Test 1: Events tab - create hook event ───────────────────────────
test('Hooks: create hook event via dropdown -> save -> listed -> persists', async ({ page }) => {
  await page.goto(`${BASE_URL}/hooks`);
  await page.waitForSelector('[data-testid="hooks-tabs"]');

  // Should be on Events tab by default
  await expect(page.locator('[data-testid="hooks-tab-events"]')).toHaveClass(/active/);

  // Switch to project scope
  await page.click('[data-testid="hooks-scope-project"]');
  await page.waitForSelector('[data-testid="hooks-event-list"]');

  // Empty state visible
  await expect(page.locator('[data-testid="hooks-empty-state"]')).toBeVisible();

  // Select "UserPromptSubmit" from dropdown
  await page.selectOption('[data-testid="hooks-new-event-select"]', 'UserPromptSubmit');
  await page.waitForSelector('[data-testid="hooks-commands-list"]');

  // Fill in command
  await page.fill('[data-testid="hooks-cmd-text-0"]', 'echo "test hook"');

  // Save
  await page.click('[data-testid="hooks-save-event"]');
  await confirmDialog(page);
  await waitForToast(page, 'saved');

  // Listed
  await expect(page.locator('[data-testid="hooks-event-UserPromptSubmit"]')).toBeVisible();

  // Persists after reload
  await page.reload();
  await page.waitForSelector('[data-testid="hooks-tabs"]');
  await page.click('[data-testid="hooks-scope-project"]');
  await page.waitForSelector('[data-testid="hooks-event-list"]');
  await expect(page.locator('[data-testid="hooks-event-UserPromptSubmit"]')).toBeVisible();
});

// ─── Test 2: Events tab - edit hook command ───────────────────────────
test('Hooks: edit hook command -> save -> reflected', async ({ page }) => {
  await page.goto(`${BASE_URL}/hooks`);
  await page.waitForSelector('[data-testid="hooks-tabs"]');
  await page.click('[data-testid="hooks-scope-project"]');
  await page.waitForSelector('[data-testid="hooks-event-list"]');

  // Select the event
  await page.click('[data-testid="hooks-event-UserPromptSubmit"]');
  await page.waitForSelector('[data-testid="hooks-commands-list"]');

  // Edit the command
  await page.fill('[data-testid="hooks-cmd-text-0"]', 'echo "updated hook"');

  // Save
  await page.click('[data-testid="hooks-save-event"]');
  await confirmDialog(page);
  await waitForToast(page, 'saved');

  // Verify after reload
  await page.reload();
  await page.waitForSelector('[data-testid="hooks-tabs"]');
  await page.click('[data-testid="hooks-scope-project"]');
  await page.waitForSelector('[data-testid="hooks-event-list"]');
  await page.click('[data-testid="hooks-event-UserPromptSubmit"]');
  await page.waitForSelector('[data-testid="hooks-cmd-text-0"]');
  const value = await page.locator('[data-testid="hooks-cmd-text-0"]').inputValue();
  expect(value).toContain('updated hook');
});

// ─── Test 3: Events tab - delete hook event ───────────────────────────
test('Hooks: delete hook event -> removed from list', async ({ page }) => {
  await page.goto(`${BASE_URL}/hooks`);
  await page.waitForSelector('[data-testid="hooks-tabs"]');
  await page.click('[data-testid="hooks-scope-project"]');
  await page.waitForSelector('[data-testid="hooks-event-list"]');

  // Select the event
  await page.click('[data-testid="hooks-event-UserPromptSubmit"]');
  await page.waitForSelector('[data-testid="hooks-delete-event"]');

  // Delete
  await page.click('[data-testid="hooks-delete-event"]');
  await confirmDialog(page);
  await waitForToast(page, 'deleted');

  // Removed from list
  await expect(page.locator('[data-testid="hooks-event-UserPromptSubmit"]')).toHaveCount(0);
});

// ─── Test 4: Scripts tab - create script ───────────────────────────────
test('Hooks: Scripts tab - create script -> save -> listed', async ({ page }) => {
  await page.goto(`${BASE_URL}/hooks`);
  await page.waitForSelector('[data-testid="hooks-tabs"]');
  await page.click('[data-testid="hooks-scope-project"]');

  // Switch to Scripts tab
  await page.click('[data-testid="hooks-tab-scripts"]');
  await page.waitForSelector('[data-testid="hooks-scripts-pane"]');

  // Empty state
  await expect(page.locator('[data-testid="hooks-scripts-empty"]')).toBeVisible();

  // Create new script
  await page.click('[data-testid="hooks-new-script-btn"]');
  await page.waitForSelector('[data-testid="hooks-new-script-name"]');
  await page.fill('[data-testid="hooks-new-script-name"]', 'test-hook.sh');
  await page.fill('[data-testid="hooks-script-editor"]', '#!/bin/bash\necho "Hello from E2E test"');

  // Create
  await page.click('[data-testid="hooks-create-script-btn"]');
  await confirmDialog(page);
  await waitForToast(page, 'created');

  // Listed
  await expect(page.locator('[data-testid="hooks-script-test-hook.sh"]')).toBeVisible();

  // Persists after reload
  await page.reload();
  await page.waitForSelector('[data-testid="hooks-tabs"]');
  await page.click('[data-testid="hooks-scope-project"]');
  await page.click('[data-testid="hooks-tab-scripts"]');
  await page.waitForSelector('[data-testid="hooks-script-list"]');
  await expect(page.locator('[data-testid="hooks-script-test-hook.sh"]')).toBeVisible();
});

// ─── Test 5: Scripts tab - delete script ───────────────────────────────
test('Hooks: Scripts tab - delete script -> removed', async ({ page }) => {
  await page.goto(`${BASE_URL}/hooks`);
  await page.waitForSelector('[data-testid="hooks-tabs"]');
  await page.click('[data-testid="hooks-scope-project"]');
  await page.click('[data-testid="hooks-tab-scripts"]');
  await page.waitForSelector('[data-testid="hooks-script-list"]');

  // Select script
  await page.click('[data-testid="hooks-script-test-hook.sh"]');
  await page.waitForSelector('[data-testid="hooks-delete-script"]');

  // Delete
  await page.click('[data-testid="hooks-delete-script"]');
  await confirmDialog(page);
  await waitForToast(page, 'deleted');

  // Removed from list
  await expect(page.locator('[data-testid="hooks-script-test-hook.sh"]')).toHaveCount(0);
});

// ─── Test 6: Health tab - shows inconsistency ─────────────────────────
test('Hooks: Health tab - shows inconsistency when script missing', async ({ page }) => {
  // First create a hook referencing a non-existent script via API
  await fetch(`${BASE_URL}/api/claude-hooks/project/PreToolUse`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commands: [{ type: 'command', command: '.claude/hooks/missing-script.sh' }],
    }),
  });

  await page.goto(`${BASE_URL}/hooks`);
  await page.waitForSelector('[data-testid="hooks-tabs"]');
  await page.click('[data-testid="hooks-scope-project"]');

  // Switch to Health tab
  await page.click('[data-testid="hooks-tab-health"]');

  // Should show error
  await expect(page.locator('[data-testid="hooks-health-error"]')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('[data-testid="hooks-issue-0"]')).toBeVisible();
});
