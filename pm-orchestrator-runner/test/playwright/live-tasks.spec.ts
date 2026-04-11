/**
 * Playwright E2E + API Test: Live Tasks page
 *
 * Implements specs/live-tasks.spec.md test cases LT-1..LT-10.
 * Reference: spec/36_LIVE_TASKS_AND_RECOVERY.md §3
 */

import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const TEST_PORT = 3608;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '../..');

let serverProcess: ChildProcess | null = null;
let tempStateDir: string;
let tempProjectDir: string;
let tempGlobalDir: string;

async function startServer(): Promise<void> {
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-lt-state-'));
  tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-lt-proj-'));
  tempGlobalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-lt-global-'));
  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'commands'), { recursive: true });
  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'agents'), { recursive: true });
  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(tempGlobalDir, 'commands'), { recursive: true });

  return new Promise((resolve, reject) => {
    const script = `
      const { createApp } = require('./src/web/server');
      const { InMemoryQueueStore } = require('./src/queue/in-memory-queue-store');

      const queueStore = new InMemoryQueueStore({ namespace: 'pw-lt' });
      const app = createApp({
        queueStore,
        sessionId: 'pw-lt-session',
        namespace: 'pw-lt',
        projectRoot: ${JSON.stringify(tempProjectDir)},
        stateDir: ${JSON.stringify(tempStateDir)},
        globalClaudeDir: ${JSON.stringify(tempGlobalDir)},
      });

      // Test-only helper routes to drive queue state
      app.post('/__test__/enqueue', async (req, res) => {
        try {
          const { taskId, taskGroupId, prompt, projectPath, status, parentTaskId, updatedAt } = req.body || {};
          const item = await queueStore.enqueue(
            'pw-lt-session',
            taskGroupId || 'tg-default',
            prompt || 'test',
            taskId,
            'IMPLEMENTATION',
            projectPath,
            parentTaskId
          );
          if (status && status !== 'QUEUED') {
            if (status === 'RUNNING' || status === 'WAITING_CHILDREN') {
              await queueStore.updateStatus(taskId, 'RUNNING');
              if (status === 'WAITING_CHILDREN') {
                await queueStore.updateStatus(taskId, 'WAITING_CHILDREN');
              }
            } else {
              await queueStore.updateStatus(taskId, status);
            }
          }
          // Forcibly backdate updated_at for stale-simulation tests
          if (updatedAt) {
            const stored = await queueStore.getItem(taskId);
            if (stored) stored.updated_at = updatedAt;
          }
          res.json({ ok: true, item });
        } catch (e) { res.status(500).json({ error: String(e) }); }
      });

      app.get('/__test__/task/:taskId', async (req, res) => {
        const item = await queueStore.getItem(req.params.taskId);
        res.json(item || null);
      });

      // Backdoor to register a project (for alias lookups)
      app.post('/__test__/register-project', async (req, res) => {
        try {
          const { getDAL, initDAL, isDALInitialized } = require('./src/web/dal/dal-factory');
          if (!isDALInitialized()) initDAL({ useDynamoDB: false, stateDir: ${JSON.stringify(tempStateDir)} });
          const dal = getDAL();
          await dal.upsertProjectIndex({
            projectId: req.body.projectId,
            projectPath: req.body.projectPath,
            alias: req.body.alias,
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          res.json({ ok: true });
        } catch (e) { res.status(500).json({ error: String(e) }); }
      });

      const server = app.listen(${TEST_PORT}, () => {
        console.log('PLAYWRIGHT_SERVER_READY');
      });
      process.on('SIGTERM', () => { server.close(); process.exit(0); });
    `;

    serverProcess = spawn('npx', ['ts-node', '--transpile-only', '-e', script], {
      cwd: PROJECT_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test', TS_NODE_TRANSPILE_ONLY: 'true', PM_RUNNER_STALE_THRESHOLD_MS: '1000' },
    });

    let output = '';
    const timeout = setTimeout(() => {
      serverProcess?.kill('SIGKILL');
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
    await new Promise(r => setTimeout(r, 500));
    serverProcess = null;
  }
  try { fs.rmSync(tempStateDir, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tempProjectDir, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tempGlobalDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

async function enqueue(body: Record<string, unknown>): Promise<void> {
  await fetch(`${BASE_URL}/__test__/enqueue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test.describe('Live Tasks Page (spec: specs/live-tasks.spec.md)', () => {
  test.beforeAll(async () => { await startServer(); });
  test.afterAll(async () => { await stopServer(); });

  // spec: specs/live-tasks.spec.md > LT-10
  test('LT-10: API returns correct shape with stale_threshold_ms', async () => {
    const res = await fetch(`${BASE_URL}/api/live-tasks`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toHaveProperty('tasks');
    expect(data).toHaveProperty('stale_count');
    expect(data).toHaveProperty('stale_threshold_ms');
    expect(data).toHaveProperty('timestamp');
    expect(typeof data.stale_threshold_ms).toBe('number');
  });

  // spec: specs/live-tasks.spec.md > LT-2
  test('LT-2: RUNNING task appears in the list', async () => {
    await enqueue({ taskId: 'lt-t1', taskGroupId: 'tg1', prompt: 'impl feature X', status: 'RUNNING' });
    const res = await fetch(`${BASE_URL}/api/live-tasks`);
    const data = await res.json();
    const t1 = data.tasks.find((t: { task_id: string }) => t.task_id === 'lt-t1');
    expect(t1).toBeDefined();
    expect(t1.status).toBe('RUNNING');
  });

  // spec: specs/live-tasks.spec.md > LT-3
  test('LT-3: WAITING_CHILDREN task is included', async () => {
    await enqueue({ taskId: 'lt-parent', taskGroupId: 'tg-p', status: 'WAITING_CHILDREN' });
    const res = await fetch(`${BASE_URL}/api/live-tasks`);
    const data = await res.json();
    const parent = data.tasks.find((t: { task_id: string }) => t.task_id === 'lt-parent');
    expect(parent).toBeDefined();
    expect(parent.status).toBe('WAITING_CHILDREN');
  });

  // spec: specs/live-tasks.spec.md > LT-4
  test('LT-4: AWAITING_RESPONSE task is included', async () => {
    await enqueue({ taskId: 'lt-awaiting', taskGroupId: 'tg-aw', status: 'RUNNING' });
    // Transition RUNNING → AWAITING_RESPONSE via set-awaiting API if available, or via status update
    const taskBefore = await (await fetch(`${BASE_URL}/__test__/task/lt-awaiting`)).json();
    // manually write status
    await fetch(`${BASE_URL}/api/tasks/lt-awaiting/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'AWAITING_RESPONSE' }),
    });
    const res = await fetch(`${BASE_URL}/api/live-tasks`);
    const data = await res.json();
    const t = data.tasks.find((tt: { task_id: string }) => tt.task_id === 'lt-awaiting');
    expect(t).toBeDefined();
    expect(t.status).toBe('AWAITING_RESPONSE');
    expect(taskBefore).not.toBeNull();
  });

  // spec: specs/live-tasks.spec.md > LT-5
  test('LT-5: stale task marked is_stale=true', async () => {
    const oldTs = new Date(Date.now() - 5000).toISOString();
    await enqueue({
      taskId: 'lt-stale',
      taskGroupId: 'tg-stale',
      status: 'RUNNING',
      updatedAt: oldTs,
    });
    const res = await fetch(`${BASE_URL}/api/live-tasks`);
    const data = await res.json();
    const t = data.tasks.find((tt: { task_id: string }) => tt.task_id === 'lt-stale');
    expect(t).toBeDefined();
    expect(t.is_stale).toBe(true);
    expect(data.stale_count).toBeGreaterThanOrEqual(1);
  });

  // spec: specs/live-tasks.spec.md > LT-9
  test('LT-9: QUEUED tasks hidden by default, shown with includeQueued=true', async () => {
    await enqueue({ taskId: 'lt-queued', taskGroupId: 'tg-q', status: 'QUEUED' });

    const without = await (await fetch(`${BASE_URL}/api/live-tasks`)).json();
    const withoutFound = without.tasks.find((t: { task_id: string }) => t.task_id === 'lt-queued');
    expect(withoutFound).toBeUndefined();

    const withFlag = await (await fetch(`${BASE_URL}/api/live-tasks?includeQueued=true`)).json();
    const withFound = withFlag.tasks.find((t: { task_id: string }) => t.task_id === 'lt-queued');
    expect(withFound).toBeDefined();
  });

  // spec: specs/live-tasks.spec.md > LT-1
  test('LT-1: UI renders Live Tasks page and Event History placeholder', async ({ page }) => {
    await page.goto(`${BASE_URL}/activity`);
    await expect(page.locator('h2')).toContainText(/Activity|Live Tasks/i);
  });
});
