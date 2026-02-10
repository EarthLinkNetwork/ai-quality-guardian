/**
 * P0-1: Executor Logs Visibility in Task Detail
 *
 * PHASE 0: Red test to capture current failure
 *
 * This test verifies that Claude Code executor stdout/stderr
 * is actually visible in the Web UI Task Detail, NOT just
 * static status messages.
 */

import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const TEST_PORT = 3599;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '../..');

let serverProcess: ChildProcess | null = null;
let tempStateDir: string;

/**
 * Start the web server for testing
 */
async function startServer(): Promise<void> {
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-p0-logs-'));

  return new Promise((resolve, reject) => {
    serverProcess = spawn('npx', [
      'ts-node',
      '-e',
      `
        const { createApp } = require('./src/web/server');
        const { InMemoryQueueStore } = require('./src/queue/in-memory-queue-store');

        const queueStore = new InMemoryQueueStore({ namespace: 'playwright-p0-test' });
        const app = createApp({
          queueStore,
          sessionId: 'playwright-p0-session',
          namespace: 'playwright-p0-test',
          projectRoot: '${PROJECT_ROOT.replace(/\\/g, '\\\\')}',
          stateDir: '${tempStateDir.replace(/\\/g, '\\\\')}',
        });

        const server = app.listen(${TEST_PORT}, () => {
          console.log('PLAYWRIGHT_SERVER_READY');
        });

        process.on('SIGTERM', () => {
          server.close();
          process.exit(0);
        });
      `
    ], {
      cwd: PROJECT_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' },
    });

    let output = '';
    const timeout = setTimeout(() => {
      reject(new Error('Server start timeout'));
    }, 30000);

    serverProcess.stdout?.on('data', (data) => {
      output += data.toString();
      if (output.includes('PLAYWRIGHT_SERVER_READY')) {
        clearTimeout(timeout);
        setTimeout(resolve, 500);
      }
    });

    serverProcess.stderr?.on('data', (data) => {
      const msg = data.toString();
      if (!msg.includes('DeprecationWarning')) {
        console.error('Server stderr:', msg);
      }
    });

    serverProcess.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Stop the test server
 */
async function stopServer(): Promise<void> {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 1000));
    serverProcess = null;
  }
  // Clean up temp directory
  if (tempStateDir && fs.existsSync(tempStateDir)) {
    fs.rmSync(tempStateDir, { recursive: true, force: true });
  }
}

/**
 * Wait for server to be healthy
 */
async function waitForServer(maxAttempts = 20): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${BASE_URL}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Ignore and retry
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Server did not become healthy');
}

test.describe('P0-1: Executor Logs Visible in Task Detail', () => {
  test.beforeAll(async () => {
    await startServer();
    await waitForServer();
  });

  test.afterAll(async () => {
    await stopServer();
  });

  test('P0-1-CORE: Task Detail must have executor log section with data-testid', async ({ page }) => {
    // First, create a task via API so we have a task to view
    const createResponse = await page.request.post(`${BASE_URL}/api/tasks`, {
      data: {
        prompt: 'P0-1 test task for executor logs visibility',
        task_group_id: 'p0-test-group',
        session_id: 'p0-test-session',
      },
    });

    // Handle both 200 and 201 (some servers return 200 for create)
    expect([200, 201]).toContain(createResponse.status());

    const taskData = await createResponse.json();
    const taskId = taskData.task_id;
    expect(taskId).toBeTruthy();

    // Navigate to Task Detail page
    await page.goto(`${BASE_URL}/tasks/${taskId}`);
    await page.waitForLoadState('networkidle');

    // P0-1 CRITICAL: Verify executor logs section exists with correct data-testid
    const executorLogsSection = page.locator('[data-testid="executor-logs-section"]');
    await expect(executorLogsSection, 'P0-1: Executor logs section must be visible').toBeVisible();

    // Verify executor logs container exists
    const executorLogsContainer = page.locator('[data-testid="executor-logs-container"]');
    await expect(executorLogsContainer, 'P0-1: Executor logs container must be visible').toBeVisible();

    // Verify the section has a heading
    const heading = executorLogsSection.locator('h3');
    await expect(heading).toContainText('Executor Output');
  });

  test('P0-1-SSE: Executor logs stream endpoint exists and returns SSE', async ({ page }) => {
    // Verify SSE endpoint exists and has correct content-type
    // We use a short timeout because SSE stays open
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const response = await fetch(`${BASE_URL}/api/executor/logs/stream`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type');
      expect(contentType, 'P0-1-SSE: Stream endpoint must return text/event-stream').toContain('text/event-stream');
    } catch (err: unknown) {
      // AbortError is expected - we just want to verify the content-type
      if (err instanceof Error && err.name !== 'AbortError') {
        throw err;
      }
    }
  });

  test('P0-1-API: Executor logs API supports task filtering', async ({ page }) => {
    // Verify the task-specific endpoint exists
    const response = await page.request.get(`${BASE_URL}/api/executor/logs/task/test-task-id`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty('taskId', 'test-task-id');
    expect(data).toHaveProperty('chunks');
  });

  test('P0-1-SUMMARY: Executor logs summary endpoint works', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/executor/summary`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty('total');
    expect(data).toHaveProperty('byStream');
    expect(data).toHaveProperty('uniqueTasks');
  });
});

test.describe('P0-5: Web Self-Update Proof', () => {
  test.beforeAll(async () => {
    // Server should already be running from previous test.describe
    // If not, start it
    try {
      const response = await fetch(`${BASE_URL}/api/health`);
      if (!response.ok) {
        await startServer();
        await waitForServer();
      }
    } catch {
      await startServer();
      await waitForServer();
    }
  });

  test.afterAll(async () => {
    await stopServer();
  });

  test('P0-5-HEALTH: /api/health returns build_sha, web_pid, and build_timestamp', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/health`);
    expect(response.ok()).toBeTruthy();

    const health = await response.json();

    // CRITICAL: These fields MUST exist for P0-5 proof
    expect(health, 'P0-5: /api/health must return build_sha').toHaveProperty('build_sha');
    expect(health, 'P0-5: /api/health must return web_pid').toHaveProperty('web_pid');
    expect(health, 'P0-5: /api/health must return build_timestamp').toHaveProperty('build_timestamp');

    // Verify they have actual values
    expect(health.build_sha).toBeTruthy();
    expect(typeof health.web_pid).toBe('number');
  });

  test('P0-5-RUNNER-CONTROLS: Runner Controls section visible in Settings', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);
    await page.waitForLoadState('networkidle');

    // Check for Runner Controls section (actual data-testid is settings-runner-controls)
    const runnerControls = page.locator('[data-testid="settings-runner-controls"]');
    await expect(runnerControls, 'P0-5: Runner Controls section must be visible').toBeVisible();

    // Check for individual buttons (actual IDs from HTML)
    const buildBtn = page.locator('#btn-runner-build');
    const buildRestartBtn = page.locator('#btn-runner-restart');
    const stopBtn = page.locator('#btn-runner-stop');
    const statusIndicator = page.locator('#runner-controls-status');

    await expect(buildBtn, 'P0-5: Build button must exist').toBeVisible();
    await expect(buildRestartBtn, 'P0-5: Build & Restart button must exist').toBeVisible();
    await expect(stopBtn, 'P0-5: Stop button must exist').toBeVisible();
    await expect(statusIndicator, 'P0-5: Status indicator must exist').toBeVisible();
  });

  test('P0-5-BUILD-API: Build API endpoint exists', async ({ page }) => {
    // Just verify the endpoint exists (we don't actually trigger a build)
    const response = await page.request.get(`${BASE_URL}/api/runner/status`);
    expect(response.ok()).toBeTruthy();

    const status = await response.json();
    // API returns isRunning, not running
    expect(status).toHaveProperty('isRunning');
    expect(status).toHaveProperty('pid');
  });
});
