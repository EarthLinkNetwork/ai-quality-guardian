/**
 * Browser E2E Test: Tasks CRUD
 *
 * Tests:
 * - Deleting a task from its detail page navigates to the parent task group page
 */

import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const TEST_PORT = 3602;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '../..');

let serverProcess: ChildProcess | null = null;
let tempStateDir: string;
let tempProjectDir: string;
let tempGlobalDir: string;

async function startServer(): Promise<void> {
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-tasks-state-'));
  tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-tasks-proj-'));
  tempGlobalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-tasks-global-'));

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

      const queueStore = new InMemoryQueueStore({ namespace: 'pw-tasks' });
      const app = createApp({
        queueStore,
        sessionId: 'pw-tasks-session',
        namespace: 'pw-tasks',
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

/** Create a task group via POST /api/task-groups and return the created task_id */
async function createTaskGroup(taskGroupId: string): Promise<string> {
  const resp = await fetch(`${BASE_URL}/api/task-groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_group_id: taskGroupId, prompt: 'Initial task for ' + taskGroupId }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Failed to create task group ${taskGroupId}: ${resp.status} ${body}`);
  }
  const data = await resp.json() as { task_id: string };
  return data.task_id;
}

/** Create an additional task via POST /api/tasks and return the task_id */
async function createTask(taskGroupId: string): Promise<string> {
  const resp = await fetch(`${BASE_URL}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_group_id: taskGroupId, prompt: 'Additional task in ' + taskGroupId }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Failed to create task in group ${taskGroupId}: ${resp.status} ${body}`);
  }
  const data = await resp.json() as { task_id: string };
  return data.task_id;
}

test.describe('Tasks CRUD', () => {
  test.beforeAll(async () => {
    await startServer();
  });

  test.afterAll(async () => {
    await stopServer();
  });

  test('task detail delete button navigates to parent task-group', async ({ page }) => {
    const tgId = 'pw-task-del-' + Date.now();

    // Create a task group (this also creates the first task internally)
    await createTaskGroup(tgId);

    // Create an additional task that we will navigate to and delete
    const taskId = await createTask(tgId);

    // Accept confirm dialogs automatically
    page.on('dialog', (dialog) => dialog.accept());

    // Navigate to the task detail page
    await page.goto(`${BASE_URL}/tasks/${encodeURIComponent(taskId)}`);
    await page.waitForTimeout(1500);

    // The "タスク削除" button should be visible in the action bar
    const deleteTaskBtn = page.locator('button', { hasText: 'タスク削除' });
    await expect(deleteTaskBtn).toBeVisible({ timeout: 5000 });

    // Click the delete button
    await deleteTaskBtn.click();

    // Wait for the DELETE API call and navigation to settle
    await page.waitForTimeout(2000);

    // Should have navigated to /task-groups/{task_group_id}
    const currentPath = new URL(page.url()).pathname;
    expect(currentPath).toBe(`/task-groups/${tgId}`);

    // Should NOT be on the task detail page or the root
    expect(currentPath).not.toMatch(/^\/tasks\//);
    expect(currentPath).not.toBe('/');
  });
});
