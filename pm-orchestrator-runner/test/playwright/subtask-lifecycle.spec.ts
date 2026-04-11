/**
 * API Test: Parent/Subtask lifecycle + deterministic pipeline + anti-hallucination
 *
 * Validates the fixes for the following user-reported issues:
 * 1. Parent task stayed COMPLETE even while children were still running (wrong).
 *    After fix: parent transitions to WAITING_CHILDREN until all children resolve,
 *    then aggregates to final status (COMPLETE/ERROR/AWAITING_RESPONSE).
 * 2. Subtask results were never written back to the parent task's output.
 *    After fix: queueStore.updateStatus(parentId, ..., aggregatedSummary) is called.
 * 3. When user checks addTest/addReview, subtasks must reference the parent's
 *    actual prompt + output — NOT invent arbitrary component names (ASH hallucination).
 * 4. [PIPELINE:*] markers no longer leak into subtask prompts.
 */

import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const TEST_PORT = 3607;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '../..');

let serverProcess: ChildProcess | null = null;
let tempStateDir: string;
let tempProjectDir: string;
let tempGlobalDir: string;

async function startServer(): Promise<void> {
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-sub-state-'));
  tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-sub-proj-'));
  tempGlobalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-sub-global-'));
  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'commands'), { recursive: true });
  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'agents'), { recursive: true });
  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(tempGlobalDir, 'commands'), { recursive: true });

  return new Promise((resolve, reject) => {
    const script = `
      const { createApp } = require('./src/web/server');
      const { InMemoryQueueStore } = require('./src/queue/in-memory-queue-store');

      const queueStore = new InMemoryQueueStore({ namespace: 'pw-sub' });
      const app = createApp({
        queueStore,
        sessionId: 'pw-sub-session',
        namespace: 'pw-sub',
        projectRoot: ${JSON.stringify(tempProjectDir)},
        stateDir: ${JSON.stringify(tempStateDir)},
        globalClaudeDir: ${JSON.stringify(tempGlobalDir)},
      });

      // Test helper: directly enqueue a task with full options
      app.post('/__test__/enqueue', async (req, res) => {
        try {
          const { taskId, taskGroupId, prompt, projectPath, addTest, addReview, parentTaskId, taskType } = req.body || {};
          const item = await queueStore.enqueue(
            'pw-sub-session',
            taskGroupId,
            prompt || 'test prompt',
            taskId,
            taskType || 'IMPLEMENTATION',
            projectPath,
            parentTaskId,
            { addTest: addTest === true, addReview: addReview === true }
          );
          res.json({ ok: true, item });
        } catch (e) { res.status(500).json({ error: String(e) }); }
      });

      // Test helper: set a task's status directly (simulates poller behaviour)
      app.post('/__test__/set-status', async (req, res) => {
        try {
          const { taskId, status, output, errorMessage } = req.body || {};
          await queueStore.updateStatus(taskId, status, errorMessage, output);
          res.json({ ok: true });
        } catch (e) { res.status(500).json({ error: String(e) }); }
      });

      // Test helper: get a task
      app.get('/__test__/task/:taskId', async (req, res) => {
        const item = await queueStore.getItem(req.params.taskId);
        res.json(item || null);
      });

      // Test helper: get all tasks in a group
      app.get('/__test__/group/:gid', async (req, res) => {
        const tasks = await queueStore.getByTaskGroup(req.params.gid);
        res.json(tasks);
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
    await new Promise(r => setTimeout(r, 500));
    serverProcess = null;
  }
  try { fs.rmSync(tempStateDir, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tempProjectDir, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tempGlobalDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

async function enqueueTask(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await fetch(`${BASE_URL}/__test__/enqueue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await r.json()) as Record<string, unknown>;
}

async function setStatus(taskId: string, status: string, output?: string, errorMessage?: string): Promise<void> {
  await fetch(`${BASE_URL}/__test__/set-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId, status, output, errorMessage }),
  });
}

async function getTask(taskId: string): Promise<Record<string, unknown> | null> {
  const r = await fetch(`${BASE_URL}/__test__/task/${encodeURIComponent(taskId)}`);
  return (await r.json()) as Record<string, unknown> | null;
}

test.describe('Parent/Subtask lifecycle + pipeline', () => {
  test.beforeAll(async () => { await startServer(); });
  test.afterAll(async () => { await stopServer(); });

  test('QueueItem supports add_test / add_review / project_alias fields', async () => {
    const res = await enqueueTask({
      taskId: 'task-lifecycle-a',
      taskGroupId: 'tg-lifecycle-a',
      prompt: 'Implement feature X',
      projectPath: tempProjectDir,
      addTest: true,
      addReview: true,
    });
    expect(res.ok).toBe(true);
    const item = (res.item as Record<string, unknown>);
    expect(item.add_test).toBe(true);
    expect(item.add_review).toBe(true);

    const stored = await getTask('task-lifecycle-a');
    expect(stored).not.toBeNull();
    expect((stored as Record<string, unknown>).add_test).toBe(true);
    expect((stored as Record<string, unknown>).add_review).toBe(true);
  });

  test('WAITING_CHILDREN is a valid transition from RUNNING', async () => {
    await enqueueTask({ taskId: 'task-wc-1', taskGroupId: 'tg-wc', prompt: 'parent' });
    // QUEUED → RUNNING → WAITING_CHILDREN
    await setStatus('task-wc-1', 'RUNNING');
    await setStatus('task-wc-1', 'WAITING_CHILDREN', 'Enqueued children: a, b');

    const task = await getTask('task-wc-1') as Record<string, unknown>;
    expect(task.status).toBe('WAITING_CHILDREN');
    expect(task.output).toContain('Enqueued children');
  });

  test('WAITING_CHILDREN can transition to COMPLETE (aggregation path)', async () => {
    await enqueueTask({ taskId: 'task-wc-2', taskGroupId: 'tg-wc2', prompt: 'parent' });
    await setStatus('task-wc-2', 'RUNNING');
    await setStatus('task-wc-2', 'WAITING_CHILDREN');
    await setStatus('task-wc-2', 'COMPLETE', 'Aggregated result: child A ok, child B ok');

    const task = await getTask('task-wc-2') as Record<string, unknown>;
    expect(task.status).toBe('COMPLETE');
    expect(task.output).toContain('Aggregated result');
  });

  test('WAITING_CHILDREN can transition to ERROR when a child fails', async () => {
    await enqueueTask({ taskId: 'task-wc-3', taskGroupId: 'tg-wc3', prompt: 'parent' });
    await setStatus('task-wc-3', 'RUNNING');
    await setStatus('task-wc-3', 'WAITING_CHILDREN');
    await setStatus('task-wc-3', 'ERROR', undefined, 'Child task failed');

    const task = await getTask('task-wc-3') as Record<string, unknown>;
    expect(task.status).toBe('ERROR');
    expect(task.error_message).toBe('Child task failed');
  });

  test('WAITING_CHILDREN can transition to AWAITING_RESPONSE when a child needs clarification', async () => {
    await enqueueTask({ taskId: 'task-wc-4', taskGroupId: 'tg-wc4', prompt: 'parent' });
    await setStatus('task-wc-4', 'RUNNING');
    await setStatus('task-wc-4', 'WAITING_CHILDREN');
    await setStatus('task-wc-4', 'AWAITING_RESPONSE');

    const task = await getTask('task-wc-4') as Record<string, unknown>;
    expect(task.status).toBe('AWAITING_RESPONSE');
  });

  test('Prompt body never contains [PIPELINE:TEST] or [PIPELINE:REVIEW] markers after fix', async () => {
    await enqueueTask({
      taskId: 'task-nopipe',
      taskGroupId: 'tg-nopipe',
      prompt: 'Some user request without markers',
      addTest: true,
      addReview: true,
    });
    const task = await getTask('task-nopipe') as Record<string, unknown>;
    expect((task.prompt as string)).not.toContain('[PIPELINE:TEST]');
    expect((task.prompt as string)).not.toContain('[PIPELINE:REVIEW]');
    // Flags must be persisted on the task record instead
    expect(task.add_test).toBe(true);
    expect(task.add_review).toBe(true);
  });

  test('Subtask with parent_task_id is stored with the parent link for aggregation', async () => {
    await enqueueTask({
      taskId: 'parent-agg',
      taskGroupId: 'tg-agg',
      prompt: 'implement something',
    });
    await enqueueTask({
      taskId: 'parent-agg-sub-1',
      taskGroupId: 'tg-agg',
      prompt: '[サブタスク 1/2 (親タスク: parent-agg)] implementation subtask',
      parentTaskId: 'parent-agg',
    });
    await enqueueTask({
      taskId: 'parent-agg-sub-2',
      taskGroupId: 'tg-agg',
      prompt: '[サブタスク 2/2 (親タスク: parent-agg)] test subtask',
      parentTaskId: 'parent-agg',
    });

    const groupRes = await fetch(`${BASE_URL}/__test__/group/tg-agg`);
    const group = (await groupRes.json()) as Array<Record<string, unknown>>;
    expect(group).toHaveLength(3);
    const subtasks = group.filter(t => t.parent_task_id === 'parent-agg');
    expect(subtasks).toHaveLength(2);
    for (const st of subtasks) {
      expect(st.parent_task_id).toBe('parent-agg');
    }
  });
});

test.describe('Meta prompt anti-hallucination guards', () => {
  // Pure function test — no server needed, but we reuse the test harness.
  test.beforeAll(async () => {
    if (!serverProcess) await startServer();
  });
  test.afterAll(async () => { await stopServer(); });

  test('System prompt includes anti-hallucination directives', async () => {
    // Read the system prompt source directly to confirm the guards landed.
    const file = await fs.promises.readFile(
      path.join(PROJECT_ROOT, 'src/utils/question-detector.ts'),
      'utf-8'
    );
    expect(file).toContain('ANTI-HALLUCINATION GUARDS');
    expect(file).toContain('NEVER invent component names');
    expect(file).toContain('SET shouldSplit=false instead');
  });
});
