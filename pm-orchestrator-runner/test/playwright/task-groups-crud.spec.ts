/**
 * Browser E2E Test: Task Groups CRUD
 *
 * Tests:
 * - Task groups list page renders correctly
 * - Delete button is present in task group list
 * - Deleting from task group detail navigates to /task-groups (not /)
 * - Deleting from task group list item navigates to /task-groups
 */

import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const TEST_PORT = 3601;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '../..');

let serverProcess: ChildProcess | null = null;
let tempStateDir: string;
let tempProjectDir: string;
let tempGlobalDir: string;

async function startServer(): Promise<void> {
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-tg-state-'));
  tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-tg-proj-'));
  tempGlobalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-tg-global-'));

  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'commands'), { recursive: true });
  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'agents'), { recursive: true });
  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(tempGlobalDir, 'commands'), { recursive: true });
  fs.mkdirSync(path.join(tempGlobalDir, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(tempGlobalDir, 'skills'), { recursive: true });

  return new Promise((resolve, reject) => {
    const script = `
      const { createApp } = require('./src/web/server');
      const { InMemoryQueueStore } = require('./src/queue/in-memory-queue-store');

      const queueStore = new InMemoryQueueStore({ namespace: 'pw-tg' });
      const app = createApp({
        queueStore,
        sessionId: 'pw-tg-session',
        namespace: 'pw-tg',
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

/** Create a task group via API and return its task_group_id */
async function createTaskGroup(taskGroupId: string): Promise<void> {
  const resp = await fetch(`${BASE_URL}/api/task-groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_group_id: taskGroupId, prompt: 'Test prompt for ' + taskGroupId }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Failed to create task group ${taskGroupId}: ${resp.status} ${body}`);
  }
}

test.describe('Task Groups CRUD', () => {
  test.beforeAll(async () => {
    await startServer();
  });

  test.afterAll(async () => {
    await stopServer();
  });

  test('task groups list page renders correctly', async ({ page }) => {
    await page.goto(`${BASE_URL}/task-groups`);
    await page.waitForTimeout(1000);
    // The "Task Groups" heading should be visible
    await expect(page.locator('h1, h2').filter({ hasText: 'Task Groups' })).toBeVisible({ timeout: 5000 });
  });

  test('delete button is present in task group list', async ({ page }) => {
    const tgId = 'pw-tg-list-del-' + Date.now();
    await createTaskGroup(tgId);

    await page.goto(`${BASE_URL}/task-groups`);
    await page.waitForTimeout(1500);

    // The list should contain a red delete button for the created task group
    // The button is rendered inline in each list item with red background
    const deleteBtn = page.locator('button', { hasText: '削除' }).first();
    await expect(deleteBtn).toBeVisible({ timeout: 5000 });

    // Verify the button has the expected red styling
    const bgColor = await deleteBtn.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    // rgb(220, 38, 38) corresponds to #dc2626
    expect(bgColor).toMatch(/220.*38.*38|dc2626/i);
  });

  test('deleting task group from detail page navigates to /task-groups not /', async ({ page }) => {
    const tgId = 'pw-tg-detail-del-' + Date.now();
    await createTaskGroup(tgId);

    // Accept confirm dialog automatically
    page.on('dialog', (dialog) => dialog.accept());

    // Navigate to task group detail page
    await page.goto(`${BASE_URL}/task-groups/${encodeURIComponent(tgId)}`);
    await page.waitForTimeout(1500);

    // Click the "グループ削除" button
    const deleteGroupBtn = page.locator('button', { hasText: 'グループ削除' });
    await expect(deleteGroupBtn).toBeVisible({ timeout: 5000 });
    await deleteGroupBtn.click();

    // Wait for navigation to settle after deletion
    await page.waitForTimeout(2000);

    // Should be on /task-groups, not /
    const currentPath = new URL(page.url()).pathname;
    expect(currentPath).toBe('/task-groups');

    // The task groups list should be rendered (not the home/root page)
    // Check that we are NOT on the root page by confirming the path
    expect(currentPath).not.toBe('/');
  });

  test('task group list item delete button navigates to /task-groups', async ({ page }) => {
    const tgId = 'pw-tg-listitem-del-' + Date.now();
    await createTaskGroup(tgId);

    // Accept confirm dialog automatically
    page.on('dialog', (dialog) => dialog.accept());

    // Navigate to the task groups list page
    await page.goto(`${BASE_URL}/task-groups`);
    await page.waitForTimeout(1500);

    // Click the inline delete button in the list item
    // The button is rendered inside each list-item and stops propagation
    const deleteBtn = page.locator('button', { hasText: '削除' }).first();
    await expect(deleteBtn).toBeVisible({ timeout: 5000 });
    await deleteBtn.click();

    // Wait for navigation to settle after deletion
    await page.waitForTimeout(2000);

    // Should remain on /task-groups
    const currentPath = new URL(page.url()).pathname;
    expect(currentPath).toBe('/task-groups');
    expect(currentPath).not.toBe('/');
  });
});
