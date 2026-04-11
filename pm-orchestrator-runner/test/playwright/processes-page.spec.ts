/**
 * Browser E2E + API Test: Task Processes page
 *
 * Verifies SAFETY requirements:
 * - /api/system/processes returns ONLY PM-Runner-spawned processes
 *   (Terminal claude sessions and Claude Desktop helpers MUST never appear)
 * - Registering a task process via process-registry surfaces it in the API
 *   with correct task_id / task_group_id / project_path / task_status
 *   joined from the queue store.
 * - /api/system/processes/:pid/kill refuses to kill PIDs not in the registry
 *   (403 NOT_OWNED) — this is the critical safety net that prevents the UI
 *   from killing the user's terminal claude sessions.
 * - Dead PIDs show up as ghost (is_alive=false) so the user can detect stuck
 *   tasks whose OS process crashed without status update.
 */

import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const TEST_PORT = 3606;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '../..');

let serverProcess: ChildProcess | null = null;
let tempStateDir: string;
let tempProjectDir: string;
let tempGlobalDir: string;

async function startServer(): Promise<void> {
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-proc-state-'));
  tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-proc-proj-'));
  tempGlobalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-proc-global-'));

  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'commands'), { recursive: true });
  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'agents'), { recursive: true });
  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(tempGlobalDir, 'commands'), { recursive: true });

  return new Promise((resolve, reject) => {
    const script = `
      const { createApp } = require('./src/web/server');
      const { InMemoryQueueStore } = require('./src/queue/in-memory-queue-store');
      const { registerTaskProcess, deregisterTaskProcess, _resetRegistry } = require('./src/executor/process-registry');

      const queueStore = new InMemoryQueueStore({ namespace: 'pw-proc' });

      // Expose hooks on a local HTTP helper so the test can drive registry state
      // without needing to fork the server. We piggyback on the main express app.
      const app = createApp({
        queueStore,
        sessionId: 'pw-proc-session',
        namespace: 'pw-proc',
        projectRoot: ${JSON.stringify(tempProjectDir)},
        stateDir: ${JSON.stringify(tempStateDir)},
        globalClaudeDir: ${JSON.stringify(tempGlobalDir)},
      });

      // Test-only helper routes for driving the in-memory registry + queue.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      app.post('/__test__/enqueue', async (req: any, res: any) => {
        try {
          const { taskId, taskGroupId, prompt, projectPath, status } = req.body || {};
          await queueStore.enqueue(
            'pw-proc-session',
            taskGroupId,
            prompt || 'test prompt',
            taskId,
            'IMPLEMENTATION',
            projectPath
          );
          if (status && status !== 'QUEUED') {
            await queueStore.updateStatus(taskId, status);
          }
          res.json({ ok: true });
        } catch (e) { res.status(500).json({ error: String(e) }); }
      });

      app.post('/__test__/register-process', (req: any, res: any) => {
        const { taskId, pid, taskGroupId, projectPath } = req.body || {};
        registerTaskProcess(taskId, {
          pid: Number(pid),
          taskGroupId,
          projectPath,
          killFn: () => { /* no-op for tests */ },
        });
        res.json({ ok: true });
      });

      app.post('/__test__/deregister-process', (req: any, res: any) => {
        deregisterTaskProcess(req.body?.taskId);
        res.json({ ok: true });
      });

      app.post('/__test__/reset-registry', (_req: any, res: any) => {
        _resetRegistry();
        res.json({ ok: true });
      });

      const server = app.listen(${TEST_PORT}, () => {
        console.log('PLAYWRIGHT_SERVER_READY');
      });

      process.on('SIGTERM', () => { server.close(); process.exit(0); });
    `;

    serverProcess = spawn('npx', ['ts-node', '--transpile-only', '-e', script], {
      cwd: PROJECT_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test', TS_NODE_TRANSPILE_ONLY: 'true' },
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
    await new Promise(resolve => setTimeout(resolve, 500));
    serverProcess = null;
  }
  try { fs.rmSync(tempStateDir, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tempProjectDir, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tempGlobalDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

async function resetRegistry(): Promise<void> {
  await fetch(`${BASE_URL}/__test__/reset-registry`, { method: 'POST' });
}

async function registerProc(taskId: string, pid: number, taskGroupId: string, projectPath: string): Promise<void> {
  await fetch(`${BASE_URL}/__test__/register-process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId, pid, taskGroupId, projectPath }),
  });
}

async function enqueueTask(taskId: string, taskGroupId: string, projectPath: string, status: string): Promise<void> {
  await fetch(`${BASE_URL}/__test__/enqueue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId, taskGroupId, projectPath, status }),
  });
}

test.describe('Task Processes page — safety & metadata', () => {
  test.beforeAll(async () => { await startServer(); });
  test.afterAll(async () => { await stopServer(); });
  test.beforeEach(async () => { await resetRegistry(); });

  test('API returns empty when no task processes registered — does NOT expose terminal claude sessions', async () => {
    const res = await fetch(`${BASE_URL}/api/system/processes`);
    expect(res.ok).toBe(true);
    const data = await res.json();

    // CRITICAL: Even though terminal claude sessions may be running on the test machine,
    // /api/system/processes must return 0 because none are in the PM Runner registry.
    expect(data.count).toBe(0);
    expect(data.ghost_count).toBe(0);
    expect(data.processes).toEqual([]);
    expect(typeof data.self_pid).toBe('number');
  });

  test('Registered task process appears with joined task metadata', async () => {
    // Create a real child process we can legitimately track
    const child = spawn('sleep', ['30']);
    const childPid = child.pid!;
    try {
      await enqueueTask('task_test_alpha', 'tg_alpha', tempProjectDir, 'RUNNING');
      await registerProc('task_test_alpha', childPid, 'tg_alpha', tempProjectDir);

      const res = await fetch(`${BASE_URL}/api/system/processes`);
      const data = await res.json();

      expect(data.count).toBe(1);
      expect(data.processes).toHaveLength(1);

      const p = data.processes[0];
      expect(p.pid).toBe(childPid);
      expect(p.task_id).toBe('task_test_alpha');
      expect(p.task_group_id).toBe('tg_alpha');
      expect(p.project_path).toBe(tempProjectDir);
      expect(p.task_status).toBe('RUNNING');
      expect(p.is_alive).toBe(true);
      expect(p.is_self).toBe(false);
      // ps-derived fields should exist for live PID
      expect(typeof p.ps_etime).toBe('string');
    } finally {
      child.kill('SIGKILL');
    }
  });

  test('Dead PID is reported as ghost (is_alive=false)', async () => {
    // Spawn a short-lived process then let it die
    const child = spawn('sleep', ['0.1']);
    const childPid = child.pid!;
    await new Promise<void>(resolve => child.on('exit', () => resolve()));
    // Now childPid no longer exists but we still register it to simulate
    // the case where PM Runner crashed before deregistering.

    await enqueueTask('task_test_ghost', 'tg_ghost', tempProjectDir, 'RUNNING');
    await registerProc('task_test_ghost', childPid, 'tg_ghost', tempProjectDir);

    const res = await fetch(`${BASE_URL}/api/system/processes`);
    const data = await res.json();

    expect(data.count).toBe(1);
    expect(data.ghost_count).toBe(1);
    const p = data.processes[0];
    expect(p.pid).toBe(childPid);
    expect(p.is_alive).toBe(false);
    expect(p.task_status).toBe('RUNNING'); // still marked RUNNING in DB → it's a ghost
  });

  test('Kill endpoint refuses to kill PIDs NOT in registry (SAFETY — terminal claude protection)', async () => {
    // Pick a PID that is definitely alive but NOT registered:
    // spawn a sleep child outside the registry and try to kill it.
    const unregisteredChild = spawn('sleep', ['30']);
    const unregisteredPid = unregisteredChild.pid!;
    try {
      const res = await fetch(`${BASE_URL}/api/system/processes/${unregisteredPid}/kill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal: 'SIGTERM' }),
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('NOT_OWNED');

      // Verify the process is still alive (was NOT killed)
      await new Promise(r => setTimeout(r, 200));
      let stillAlive = true;
      try { process.kill(unregisteredPid, 0); } catch { stillAlive = false; }
      expect(stillAlive).toBe(true);
    } finally {
      unregisteredChild.kill('SIGKILL');
    }
  });

  test('Kill endpoint succeeds for registered PIDs', async () => {
    const child = spawn('sleep', ['30']);
    const childPid = child.pid!;
    try {
      await enqueueTask('task_test_kill', 'tg_kill', tempProjectDir, 'RUNNING');
      // Register with a real killFn backed by the child handle so kill() actually kills it
      // We use the test helper which installs a no-op killFn; the kill API uses that no-op.
      // To verify end-to-end kill, we register then manually kill via the API and check
      // that the registry entry is removed (the no-op intentionally does nothing to the
      // process; kill-by-registry-only is the API contract we're testing).
      await registerProc('task_test_kill', childPid, 'tg_kill', tempProjectDir);

      const res = await fetch(`${BASE_URL}/api/system/processes/${childPid}/kill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal: 'SIGTERM' }),
      });
      expect(res.ok).toBe(true);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.pid).toBe(childPid);
      expect(body.task_id).toBe('task_test_kill');

      // Registry entry should be removed after kill
      const after = await fetch(`${BASE_URL}/api/system/processes`);
      const data = await after.json();
      expect(data.count).toBe(0);
    } finally {
      child.kill('SIGKILL');
    }
  });

  test('Kill endpoint refuses to kill self PID', async () => {
    const res = await fetch(`${BASE_URL}/api/system/processes`);
    const data = await res.json();
    const selfPid = data.self_pid;

    const killRes = await fetch(`${BASE_URL}/api/system/processes/${selfPid}/kill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signal: 'SIGTERM' }),
    });
    expect(killRes.status).toBe(400);
    const body = await killRes.json();
    expect(body.error).toBe('VALIDATION_ERROR');
  });

  test('UI: Processes page renders summary + empty state when no processes', async ({ page }) => {
    await resetRegistry();
    await page.goto(`${BASE_URL}/processes`);
    await expect(page.locator('h2')).toContainText('Task Processes');
    // Safety banner should be visible
    await expect(page.locator('text=SAFETY:')).toBeVisible();
    // Empty state
    await expect(page.locator('[data-testid="processes-list"]')).toContainText(/No active task processes/i);
  });

  test('UI: Processes page renders ghost badge for dead PIDs', async ({ page }) => {
    // Spawn then kill a process, register it as RUNNING
    const child = spawn('sleep', ['0.1']);
    const childPid = child.pid!;
    await new Promise<void>(resolve => child.on('exit', () => resolve()));
    await enqueueTask('task_ui_ghost', 'tg_ui_ghost', tempProjectDir, 'RUNNING');
    await registerProc('task_ui_ghost', childPid, 'tg_ui_ghost', tempProjectDir);

    await page.goto(`${BASE_URL}/processes`);
    await expect(page.locator('[data-testid="ghost-count"]')).toContainText(/1.*ghost/);
    await expect(page.locator('[data-testid="ghost-badge"]')).toBeVisible();
  });
});
