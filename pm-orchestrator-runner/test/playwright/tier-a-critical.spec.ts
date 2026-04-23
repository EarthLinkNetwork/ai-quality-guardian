/**
 * Playwright Tier A Critical Tests
 *
 * Tests for critical gaps identified by audit:
 * 1. XSS prevention - script injection in markdown is sanitized
 * 2. Concurrent task claim - only one poller can claim a task
 * 3. Stale recovery on startup - stale RUNNING tasks detected
 * 4. Plugin install idempotency - double install does not corrupt
 * 5. CANCELLED transition from COMPLETE is blocked
 */

import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const TEST_PORT = 3610;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '../..');

let serverProcess: ChildProcess | null = null;
let tempStateDir: string;
let tempProjectDir: string;
let tempGlobalDir: string;

async function startServer(opts?: { preEnqueueStaleTask?: boolean }): Promise<void> {
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-tiera-state-'));
  tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-tiera-proj-'));
  tempGlobalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-tiera-global-'));

  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'commands'), { recursive: true });
  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'agents'), { recursive: true });
  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(tempGlobalDir, 'commands'), { recursive: true });
  fs.mkdirSync(path.join(tempGlobalDir, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(tempGlobalDir, 'skills'), { recursive: true });

  // For stale recovery test: inject a task that is RUNNING with backdated updated_at
  // into the server script so it exists before recoverStaleTasks runs on startup
  const staleTaskInjection = opts?.preEnqueueStaleTask ? `
      // Pre-seed a RUNNING task with old updated_at before poller starts
      (async () => {
        await queueStore.enqueue(
          'pw-tiera-session', 'tg-stale', 'stale-test-prompt', 'stale-task-1',
          'IMPLEMENTATION'
        );
        await queueStore.updateStatus('stale-task-1', 'RUNNING');
        // Backdate updated_at by 5 seconds
        const item = await queueStore.getItem('stale-task-1');
        if (item) item.updated_at = new Date(Date.now() - 5000).toISOString();
        // Now run stale recovery with 1s threshold
        const recovered = await queueStore.recoverStaleTasks(1000);
        console.log('STALE_RECOVERED=' + recovered);
      })();
  ` : '';

  return new Promise((resolve, reject) => {
    const script = `
      const { createApp } = require('./src/web/server');
      const { InMemoryQueueStore } = require('./src/queue/in-memory-queue-store');

      const queueStore = new InMemoryQueueStore({ namespace: 'pw-tiera' });
      const app = createApp({
        queueStore,
        sessionId: 'pw-tiera-session',
        namespace: 'pw-tiera',
        projectRoot: ${JSON.stringify(tempProjectDir)},
        stateDir: ${JSON.stringify(tempStateDir)},
        globalClaudeDir: ${JSON.stringify(tempGlobalDir)},
      });

      // ── Test helpers ──

      app.post('/__test__/enqueue', async (req, res) => {
        try {
          const { taskId, taskGroupId, prompt, projectPath, status, parentTaskId, updatedAt } = req.body || {};
          await queueStore.enqueue(
            'pw-tiera-session',
            taskGroupId || 'tg-default',
            prompt || 'test',
            taskId,
            'IMPLEMENTATION',
            projectPath,
            parentTaskId
          );
          if (status && status !== 'QUEUED') {
            if (status === 'RUNNING' || status === 'WAITING_CHILDREN' || status === 'ERROR') {
              await queueStore.updateStatus(taskId, 'RUNNING');
              if (status !== 'RUNNING') {
                await queueStore.updateStatus(taskId, status);
              }
            } else {
              await queueStore.updateStatus(taskId, status);
            }
          }
          if (updatedAt) {
            const stored = await queueStore.getItem(taskId);
            if (stored) stored.updated_at = updatedAt;
          }
          res.json({ ok: true });
        } catch (e) { res.status(500).json({ error: String(e) }); }
      });

      app.get('/__test__/task/:taskId', async (req, res) => {
        const item = await queueStore.getItem(req.params.taskId);
        res.json(item || null);
      });

      app.post('/__test__/claim', async (_req, res) => {
        const result = await queueStore.claim();
        res.json(result);
      });

      ${staleTaskInjection}

      const server = app.listen(${TEST_PORT}, () => {
        console.log('PLAYWRIGHT_SERVER_READY');
      });
      process.on('SIGTERM', () => { server.close(); process.exit(0); });
    `;

    serverProcess = spawn('npx', ['ts-node', '--transpile-only', '-e', script], {
      cwd: PROJECT_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        TS_NODE_TRANSPILE_ONLY: 'true',
        PM_RUNNER_STALE_THRESHOLD_MS: '1000',
      },
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
  const r = await fetch(`${BASE_URL}/__test__/enqueue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`enqueue failed: ${r.status} ${await r.text()}`);
}

async function getTask(id: string): Promise<Record<string, unknown> | null> {
  const r = await fetch(`${BASE_URL}/__test__/task/${encodeURIComponent(id)}`);
  return (await r.json()) as Record<string, unknown> | null;
}

// ═══════════════════════════════════════════════════════════════
// Test Group 1: XSS, Concurrent Claim, Plugin Idempotency, CANCELLED blocked
// (shared server instance)
// ═══════════════════════════════════════════════════════════════

test.describe('Tier A Critical (shared server)', () => {
  test.beforeAll(async () => { await startServer(); });
  test.afterAll(async () => { await stopServer(); });

  // ─── Test 1: XSS prevention ───────────────────────────────
  test('XSS prevention: javascript: links in README are stripped by DOMPurify', async ({ page }) => {
    // 1. Create README.md with a malicious javascript: link and a safe link
    fs.writeFileSync(
      path.join(tempProjectDir, 'README.md'),
      '# Title\n\n[click](javascript:alert(1))\n[safe](https://example.com)\n'
    );

    // 2. Register the project
    const regResp = await fetch(`${BASE_URL}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectPath: tempProjectDir,
        alias: 'xss-test-project',
      }),
    });
    expect(regResp.ok).toBe(true);
    const project = await regResp.json() as { projectId: string };
    const projectId = project.projectId;

    // 3. Navigate to project detail page (README is rendered there)
    await page.goto(`${BASE_URL}/projects/${encodeURIComponent(projectId)}`);

    // 3b. Open the README tab (Project Detail is now tabbed; spec/19_WEB_UI.md "Project Detail ページ仕様").
    const readmeTab = page.locator('[data-testid="project-detail-tab-readme"]');
    await expect(readmeTab).toBeVisible({ timeout: 10000 });
    await readmeTab.click();

    // 4. Wait for README content to load
    const readmeBody = page.locator('[data-testid="project-readme-body"]');
    await expect(readmeBody).toBeVisible({ timeout: 10000 });

    // 5. Collect every <a> in the README body. The "safe" anchor must
    //    be present; the "malicious" anchor either has its href stripped
    //    entirely (DOMPurify's behaviour for javascript: URLs) or, in the
    //    legacy homegrown parser, was rewritten to "#". Both are acceptable.
    const links = readmeBody.locator('a');
    const count = await links.count();
    expect(count).toBeGreaterThanOrEqual(2);

    const hrefs: (string | null)[] = [];
    for (let i = 0; i < count; i++) {
      hrefs.push(await links.nth(i).getAttribute('href'));
    }

    // 6. Verify: no href contains 'javascript:'.
    for (const href of hrefs) {
      if (href !== null) {
        expect(href.toLowerCase()).not.toContain('javascript:');
      }
    }

    // 7. Verify: the safe link IS present.
    const presentHrefs = hrefs.filter((h): h is string => h !== null);
    expect(presentHrefs).toContain('https://example.com');

    // 8. Verify: the malicious link was neutralised (href removed or '#').
    const maliciousNeutralised =
      hrefs.some((h) => h === null) || presentHrefs.some((h) => h === '#');
    expect(maliciousNeutralised).toBe(true);
  });

  // ─── Test 2: Concurrent task claim ────────────────────────
  test('Concurrent claim: only one of 10 parallel claims succeeds', async () => {
    // 1. Enqueue exactly one task
    const taskId = 'claim-race-' + Date.now();
    await enqueue({ taskId, taskGroupId: 'tg-claim-race', prompt: 'race test' });

    // 2. Fire 10 concurrent claim requests
    const promises = Array.from({ length: 10 }, () =>
      fetch(`${BASE_URL}/__test__/claim`, { method: 'POST' }).then(r => r.json())
    );
    const results = await Promise.all(promises) as Array<{ success: boolean }>;

    // 3. Exactly 1 success
    const successes = results.filter(r => r.success === true);
    const failures = results.filter(r => r.success === false);
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(9);

    // 4. Task should now be RUNNING
    const task = await getTask(taskId);
    expect(task).not.toBeNull();
    expect(task!.status).toBe('RUNNING');
  });

  // ─── Test 4: Plugin install idempotency ───────────────────
  test('Plugin install idempotency: double install does not corrupt', async ({ page }) => {
    // 1. Create a plugin via API
    const pluginResp = await fetch(`${BASE_URL}/api/assistant/plugins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Idempotent Plugin',
        description: 'Plugin for idempotency test',
        choice: {
          choiceId: 'idempotent-choice',
          title: 'Idempotent Plugin',
          summary: 'Creates a test command',
          scope: 'project',
          artifacts: [
            {
              kind: 'command',
              name: 'idempotent-cmd',
              targetPathHint: '.claude/commands/idempotent-cmd.md',
              content: '# Idempotent Command\n\nThis was installed by a plugin.',
            },
          ],
          applySteps: ['Create command file'],
          rollbackSteps: ['Delete command file'],
          riskNotes: [],
          questions: [],
        },
      }),
    });
    expect(pluginResp.ok).toBe(true);
    const plugin = await pluginResp.json() as { pluginId: string };

    // 2. First install
    const install1 = await fetch(`${BASE_URL}/api/assistant/plugins/${plugin.pluginId}/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(install1.ok).toBe(true);

    // Verify file was created
    const cmdPath = path.join(tempProjectDir, '.claude', 'commands', 'idempotent-cmd.md');
    expect(fs.existsSync(cmdPath)).toBe(true);
    const content1 = fs.readFileSync(cmdPath, 'utf-8');
    expect(content1).toContain('Idempotent Command');

    // 3. Second install (idempotent or explicit error)
    const install2 = await fetch(`${BASE_URL}/api/assistant/plugins/${plugin.pluginId}/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    // Accept: either 200 (idempotent success) or 409/422 (explicit error)
    expect([200, 409, 422]).toContain(install2.status);

    // 4. Verify: no duplicate files, original file is intact
    expect(fs.existsSync(cmdPath)).toBe(true);
    const content2 = fs.readFileSync(cmdPath, 'utf-8');
    expect(content2).toContain('Idempotent Command');

    // Verify no duplicate files (e.g., idempotent-cmd-1.md or similar)
    const commandsDir = path.join(tempProjectDir, '.claude', 'commands');
    const files = fs.readdirSync(commandsDir).filter(f => f.includes('idempotent'));
    expect(files.length).toBe(1);
    expect(files[0]).toBe('idempotent-cmd.md');
  });

  // ─── Test 5: CANCELLED transition from COMPLETE is blocked ─
  test('CANCELLED transition from COMPLETE is blocked (terminal state)', async () => {
    // 1. Create a task and move to COMPLETE
    const taskId = 'complete-terminal-' + Date.now();
    await enqueue({
      taskId,
      taskGroupId: 'tg-terminal',
      prompt: 'terminal state test',
    });

    // QUEUED -> RUNNING
    const run = await fetch(`${BASE_URL}/api/tasks/${encodeURIComponent(taskId)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'RUNNING' }),
    });
    expect(run.ok).toBe(true);

    // RUNNING -> COMPLETE
    const complete = await fetch(`${BASE_URL}/api/tasks/${encodeURIComponent(taskId)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETE' }),
    });
    expect(complete.ok).toBe(true);

    // 2. Attempt COMPLETE -> CANCELLED (should fail)
    const cancel = await fetch(`${BASE_URL}/api/tasks/${encodeURIComponent(taskId)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CANCELLED' }),
    });
    expect(cancel.status).toBe(400);

    const body = await cancel.json() as { error: string; message: string };
    expect(body.error).toBe('Invalid status transition');
    expect(body.message).toContain('COMPLETE');
    expect(body.message).toContain('CANCELLED');

    // 3. Verify task is still COMPLETE
    const task = await getTask(taskId);
    expect(task).not.toBeNull();
    expect(task!.status).toBe('COMPLETE');
  });
});

// ═══════════════════════════════════════════════════════════════
// Test Group 2: Stale recovery (needs dedicated server lifecycle)
// ═══════════════════════════════════════════════════════════════

test.describe('Tier A Critical (stale recovery)', () => {
  test.beforeAll(async () => {
    await startServer({ preEnqueueStaleTask: true });
  });
  test.afterAll(async () => { await stopServer(); });

  test('Stale recovery: pre-seeded RUNNING task is recovered to ERROR on startup', async () => {
    // The stale task was pre-seeded in the server script and recoverStaleTasks
    // was called before the server started listening. Wait for it to settle.
    await new Promise(r => setTimeout(r, 1000));

    // Check the task status
    const task = await getTask('stale-task-1');
    expect(task).not.toBeNull();
    expect(task!.status).toBe('ERROR');

    // error_message should contain 'stale'
    const errMsg = String(task!.error_message || '');
    expect(errMsg.toLowerCase()).toContain('stale');
  });
});
