/**
 * E2E Test: Assistant Plan Safety Guards
 *
 * Verifies that the server rejects dangerous/invalid proposals:
 * - Path traversal in artifact name
 * - Dangerous file extensions (.exe, .bat, etc.)
 * - dependsOn circular references
 * - dependsOn referencing non-existent artifacts
 * - Absolute paths in targetPathHint
 * - Invalid artifact kind
 *
 * Also verifies that valid plans still work (regression guard).
 */

import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const TEST_PORT = 3594;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '../..');

let serverProcess: ChildProcess | null = null;
let tempStateDir: string;
let tempProjectDir: string;
let tempGlobalDir: string;

async function startServer(): Promise<void> {
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-guards-state-'));
  tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-guards-project-'));
  tempGlobalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-guards-global-'));

  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'commands'), { recursive: true });

  return new Promise((resolve, reject) => {
    const script = `
      const { createApp } = require('./src/web/server');
      const { InMemoryQueueStore } = require('./src/queue/in-memory-queue-store');

      const queueStore = new InMemoryQueueStore({ namespace: 'pw-guards' });
      const app = createApp({
        queueStore,
        sessionId: 'pw-guards-session',
        namespace: 'pw-guards',
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

/** Helper to build a minimal valid choice with overrides */
function makeChoice(overrides: Record<string, unknown> = {}, artifactOverrides: Record<string, unknown>[] = [{}]) {
  const artifacts = artifactOverrides.map((ao, i) => ({
    kind: 'command',
    name: `test-artifact-${i}`,
    targetPathHint: `.claude/commands/test-artifact-${i}.md`,
    content: '# Test',
    ...ao,
  }));

  return {
    choiceId: 'test-choice',
    title: 'Test Choice',
    summary: 'Test',
    scope: 'project',
    artifacts,
    applySteps: [],
    rollbackSteps: [],
    riskNotes: [],
    questions: [],
    ...overrides,
  };
}

test.beforeAll(async () => {
  await startServer();
});

test.afterAll(async () => {
  await stopServer();
});

// ─── Validate endpoint tests ───────────────────────────────

test('Guard: path traversal in artifact name is rejected', async ({ page }) => {
  const choice = makeChoice({}, [{ name: '../../../etc/passwd', kind: 'command' }]);
  const resp = await page.request.post(`${BASE_URL}/api/assistant/validate`, {
    data: { choice },
  });

  expect(resp.status()).toBe(422);
  const body = await resp.json();
  expect(body.error).toBe('PLAN_VALIDATION_FAILED');
  expect(body.validationErrors.length).toBeGreaterThan(0);
  expect(body.validationErrors.some((e: string) => e.includes('..'))).toBe(true);
});

test('Guard: path separator in artifact name is rejected', async ({ page }) => {
  const choice = makeChoice({}, [{ name: 'sub/dir/file', kind: 'command' }]);
  const resp = await page.request.post(`${BASE_URL}/api/assistant/validate`, {
    data: { choice },
  });

  expect(resp.status()).toBe(422);
  const body = await resp.json();
  expect(body.validationErrors.some((e: string) => e.includes('path separator'))).toBe(true);
});

test('Guard: dangerous extension (.exe) in artifact name is rejected', async ({ page }) => {
  const choice = makeChoice({}, [{ name: 'malware.exe', kind: 'command' }]);
  const resp = await page.request.post(`${BASE_URL}/api/assistant/validate`, {
    data: { choice },
  });

  expect(resp.status()).toBe(422);
  const body = await resp.json();
  expect(body.validationErrors.some((e: string) => e.includes('.exe'))).toBe(true);
});

test('Guard: dangerous extension (.bat) in artifact name is rejected', async ({ page }) => {
  const choice = makeChoice({}, [{ name: 'script.bat', kind: 'command' }]);
  const resp = await page.request.post(`${BASE_URL}/api/assistant/validate`, {
    data: { choice },
  });

  expect(resp.status()).toBe(422);
  const body = await resp.json();
  expect(body.validationErrors.some((e: string) => e.includes('.bat'))).toBe(true);
});

test('Guard: absolute path in targetPathHint is rejected', async ({ page }) => {
  const choice = makeChoice({}, [{ name: 'safe-name', targetPathHint: '/etc/passwd' }]);
  const resp = await page.request.post(`${BASE_URL}/api/assistant/validate`, {
    data: { choice },
  });

  expect(resp.status()).toBe(422);
  const body = await resp.json();
  expect(body.validationErrors.some((e: string) => e.includes('absolute path'))).toBe(true);
});

test('Guard: ".." in targetPathHint is rejected', async ({ page }) => {
  const choice = makeChoice({}, [{ name: 'safe-name', targetPathHint: '../../etc/passwd' }]);
  const resp = await page.request.post(`${BASE_URL}/api/assistant/validate`, {
    data: { choice },
  });

  expect(resp.status()).toBe(422);
  const body = await resp.json();
  expect(body.validationErrors.some((e: string) => e.includes('..') && e.includes('targetPathHint'))).toBe(true);
});

test('Guard: invalid artifact kind is rejected', async ({ page }) => {
  const choice = makeChoice({}, [{ kind: 'executable', name: 'bad' }]);
  const resp = await page.request.post(`${BASE_URL}/api/assistant/validate`, {
    data: { choice },
  });

  expect(resp.status()).toBe(422);
  const body = await resp.json();
  expect(body.validationErrors.some((e: string) => e.includes('invalid kind'))).toBe(true);
});

test('Guard: dependsOn circular reference is rejected', async ({ page }) => {
  const choice = makeChoice({}, [
    { name: 'a', dependsOn: ['b'] },
    { name: 'b', dependsOn: ['c'] },
    { name: 'c', dependsOn: ['a'] },
  ]);
  const resp = await page.request.post(`${BASE_URL}/api/assistant/validate`, {
    data: { choice },
  });

  expect(resp.status()).toBe(422);
  const body = await resp.json();
  expect(body.validationErrors.some((e: string) => e.includes('Circular dependency'))).toBe(true);
});

test('Guard: dependsOn referencing non-existent artifact is rejected', async ({ page }) => {
  const choice = makeChoice({}, [
    { name: 'real-artifact', dependsOn: ['ghost-artifact'] },
  ]);
  const resp = await page.request.post(`${BASE_URL}/api/assistant/validate`, {
    data: { choice },
  });

  expect(resp.status()).toBe(422);
  const body = await resp.json();
  expect(body.validationErrors.some((e: string) => e.includes('non-existent'))).toBe(true);
});

// ─── Apply endpoint also validates ───────────────────────────

test('Guard: apply endpoint rejects invalid plan (server-side)', async ({ page }) => {
  const choice = makeChoice({}, [{ name: '../hack', kind: 'command' }]);
  const resp = await page.request.post(`${BASE_URL}/api/assistant/apply`, {
    data: { choice },
  });

  expect(resp.status()).toBe(422);
  const body = await resp.json();
  expect(body.error).toBe('PLAN_VALIDATION_FAILED');
  expect(body.success).toBe(false);
  expect(body.validationErrors.length).toBeGreaterThan(0);
});

// ─── Valid plan still works (regression guard) ────────────────

test('Regression: valid plan passes validation', async ({ page }) => {
  const choice = makeChoice({}, [
    { name: 'valid-command', kind: 'command', content: '# Valid command' },
  ]);
  const resp = await page.request.post(`${BASE_URL}/api/assistant/validate`, {
    data: { choice },
  });

  expect(resp.ok()).toBeTruthy();
  const body = await resp.json();
  expect(body.valid).toBe(true);
  expect(body.validationErrors).toEqual([]);
});

test('Regression: valid plan applies successfully', async ({ page }) => {
  const choice = makeChoice({}, [
    { name: 'guards-test-cmd', kind: 'command', content: '# Guards test command\n\nCreated by plan guards E2E test.' },
  ]);
  const resp = await page.request.post(`${BASE_URL}/api/assistant/apply`, {
    data: { choice },
  });

  expect(resp.ok()).toBeTruthy();
  const body = await resp.json();
  expect(body.success).toBe(true);
  expect(body.created.length).toBe(1);

  // Verify file was actually created
  const cmdPath = path.join(tempProjectDir, '.claude', 'commands', 'guards-test-cmd.md');
  expect(fs.existsSync(cmdPath)).toBe(true);
});

// ─── UI integration: validation error shown as toast ──────────

test('UI: validation error shown as toast when applying invalid plan', async ({ page }) => {
  // Navigate to assistant page with mock mode
  await page.goto(`${BASE_URL}/assistant?mock=true`);
  await page.waitForSelector('[data-testid="assistant-input"]');

  // Generate a valid proposal first
  await page.fill('[data-testid="assistant-input"]', 'Create a test command');
  await page.click('[data-testid="assistant-send-btn"]');
  await expect(page.locator('[data-testid="proposal-card"]').first()).toBeVisible({ timeout: 10000 });

  // Now tamper with the planSet in memory to inject an invalid artifact name
  await page.evaluate(() => {
    const state = (window as Record<string, unknown>).assistantState as { planSet: { choices: Array<{ artifacts: Array<{ name: string }> }> } };
    if (state && state.planSet && state.planSet.choices[0]) {
      state.planSet.choices[0].artifacts[0].name = '../../../etc/passwd';
    }
  });

  // Click Apply - the UI should call validate first and show error toast
  await page.click('[data-testid="apply-btn"]');

  // Wait for error toast to appear
  await expect(page.locator('.toast').filter({ hasText: 'Plan rejected' })).toBeVisible({ timeout: 5000 });
});
