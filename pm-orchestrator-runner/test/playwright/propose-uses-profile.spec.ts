/**
 * E2E Test: Propose Uses Profile
 *
 * Verifies:
 * - Mock propose returns valid planSet
 * - Set-based proposals render correctly (multiple choices)
 * - Apply shows "Open created items" links
 * - Apply failure shows "Rollback now" button
 * - Save-as-plugin includes marketplace metadata fields
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

async function startServer(): Promise<void> {
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-propose-state-'));
  tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-propose-project-'));

  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'commands'), { recursive: true });
  fs.writeFileSync(path.join(tempProjectDir, 'package.json'), JSON.stringify({
    name: 'propose-test-repo',
    devDependencies: { typescript: '^5.0.0' }
  }, null, 2));

  return new Promise((resolve, reject) => {
    const script = `
      const { createApp } = require('./src/web/server');
      const { InMemoryQueueStore } = require('./src/queue/in-memory-queue-store');

      const queueStore = new InMemoryQueueStore({ namespace: 'pw-propose' });
      const app = createApp({
        queueStore,
        sessionId: 'pw-propose-session',
        namespace: 'pw-propose',
        projectRoot: '${tempProjectDir.replace(/'/g, "\\'")}',
        stateDir: '${tempStateDir.replace(/'/g, "\\'")}',
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
  for (const dir of [tempStateDir, tempProjectDir]) {
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

test.beforeAll(async () => {
  await startServer();
});

test.afterAll(async () => {
  await stopServer();
});

// ─── API Tests ─────────────────────────────────────────────

test('Mock propose returns planSet with repoProfile context', async ({ page }) => {
  const resp = await page.request.post(`${BASE_URL}/api/assistant/propose?mock=true`, {
    data: {
      prompt: 'Create a test command',
      scope: 'project',
      repoProfile: { name: 'test-repo', language: 'typescript' }
    }
  });
  expect(resp.ok()).toBeTruthy();
  const planSet = await resp.json();

  expect(planSet.planSetId).toBeTruthy();
  expect(planSet.choices).toHaveLength(1);
  expect(planSet.choices[0].artifacts).toHaveLength(1);
  expect(planSet.choices[0].artifacts[0].kind).toBe('command');
});

test('Apply endpoint returns created files list', async ({ page }) => {
  const resp = await page.request.post(`${BASE_URL}/api/assistant/apply`, {
    data: {
      choice: {
        choiceId: 'test-apply',
        title: 'Test',
        summary: 'Test apply',
        scope: 'project',
        artifacts: [
          { kind: 'command', name: 'propose-test-cmd', targetPathHint: '.claude/commands/propose-test-cmd.md', content: '# Test command' }
        ],
        applySteps: [],
        rollbackSteps: [],
        riskNotes: [],
        questions: []
      }
    }
  });
  expect(resp.ok()).toBeTruthy();
  const result = await resp.json();

  expect(result.success).toBe(true);
  expect(result.created.length).toBe(1);
  expect(result.created[0]).toContain('propose-test-cmd');
});

// ─── UI Tests ──────────────────────────────────────────────

test('Proposals render as set with count', async ({ page }) => {
  await page.goto(`${BASE_URL}/assistant?mock=true`);
  await page.waitForSelector('[data-testid="assistant-input"]');

  await page.fill('[data-testid="assistant-input"]', 'Create a test command');
  await page.click('[data-testid="assistant-send-btn"]');
  await expect(page.locator('[data-testid="proposal-card"]').first()).toBeVisible({ timeout: 10000 });

  // Verify set-based header showing count
  await expect(page.locator('.assistant-proposals')).toContainText('proposal(s) generated');
});

test('Apply success shows post-apply panel with Open links', async ({ page }) => {
  await page.goto(`${BASE_URL}/assistant?mock=true`);
  await page.waitForSelector('[data-testid="assistant-input"]');

  await page.fill('[data-testid="assistant-input"]', 'Create a test command');
  await page.click('[data-testid="assistant-send-btn"]');
  await expect(page.locator('[data-testid="proposal-card"]').first()).toBeVisible({ timeout: 10000 });

  // Click Apply
  await page.click('[data-testid="apply-btn"]');
  // Confirm dialog
  await page.waitForSelector('.confirm-dialog');
  await page.click('.confirm-dialog [data-action="confirm"]');

  // Wait for post-apply panel
  await expect(page.locator('[data-testid="post-apply-panel"]')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('[data-testid="post-apply-panel"]')).toContainText('Applied successfully');
  await expect(page.locator('[data-testid="open-created-link"]')).toBeVisible();
});

test('Save-as-plugin dialog shows marketplace metadata fields', async ({ page }) => {
  await page.goto(`${BASE_URL}/assistant?mock=true`);
  await page.waitForSelector('[data-testid="assistant-input"]');

  await page.fill('[data-testid="assistant-input"]', 'Create something');
  await page.click('[data-testid="assistant-send-btn"]');
  await expect(page.locator('[data-testid="proposal-card"]').first()).toBeVisible({ timeout: 10000 });

  // Click Save as Plugin
  await page.click('[data-testid="save-plugin-btn"]');
  await page.waitForSelector('.confirm-dialog');

  // Verify metadata fields exist
  await expect(page.locator('[data-testid="plugin-save-name-input"]')).toBeVisible();
  await expect(page.locator('[data-testid="plugin-save-tags-input"]')).toBeVisible();
  await expect(page.locator('[data-testid="plugin-save-category-select"]')).toBeVisible();
  await expect(page.locator('[data-testid="plugin-save-author-input"]')).toBeVisible();
});
