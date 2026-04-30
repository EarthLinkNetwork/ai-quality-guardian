/**
 * Browser E2E Test: AI Generate planKind selector (Batch 5)
 *
 * Validates that the /ai-generate page exposes a planKind selector with
 * the 3 expected options (auto / spec-first-tdd / plugin-bundle), persists
 * the choice in localStorage, and forwards the selected planKind to the
 * server which echoes it back as meta.selectedPlanKind (mock mode).
 *
 * Spec: spec/37_AI_GENERATE.md §10 + spec/19_WEB_UI.md "AI Generate Plan Kind Selector"
 */

import { test, expect, Page } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const TEST_PORT = 3623;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '../..');

let serverProcess: ChildProcess | null = null;
let tempStateDir: string;
let tempProjectDir: string;
let tempGlobalDir: string;

async function startServer(): Promise<void> {
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-aigenpk-state-'));
  tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-aigenpk-proj-'));
  tempGlobalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-aigenpk-global-'));

  fs.mkdirSync(path.join(tempProjectDir, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(tempGlobalDir), { recursive: true });

  return new Promise((resolve, reject) => {
    const script = `
      const { createApp } = require('./src/web/server');
      const { InMemoryQueueStore } = require('./src/queue/in-memory-queue-store');

      const queueStore = new InMemoryQueueStore({ namespace: 'pw-aigenpk' });
      const app = createApp({
        queueStore,
        sessionId: 'pw-aigenpk-session',
        namespace: 'pw-aigenpk',
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

async function gotoAiGenerate(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/?mock=true#/ai-generate`);
  await page.waitForSelector('[data-testid="ai-generate-plan-kind"]', { timeout: 10000 });
}

test.beforeAll(async () => {
  await startServer();
});

test.afterAll(async () => {
  await stopServer();
});

test('planKind select is visible on /ai-generate', async ({ page }) => {
  await gotoAiGenerate(page);
  await expect(page.locator('[data-testid="ai-generate-plan-kind"]')).toBeVisible();
});

test('planKind select exposes auto / spec-first-tdd / plugin-bundle options', async ({ page }) => {
  await gotoAiGenerate(page);
  const values = await page.$$eval(
    '[data-testid="ai-generate-plan-kind"] option',
    (opts) => opts.map((o) => (o as HTMLOptionElement).value)
  );
  expect(values).toContain('auto');
  expect(values).toContain('spec-first-tdd');
  expect(values).toContain('plugin-bundle');
});

test('selecting planKind persists in localStorage', async ({ page }) => {
  await gotoAiGenerate(page);
  await page.selectOption('[data-testid="ai-generate-plan-kind"]', 'spec-first-tdd');
  const stored = await page.evaluate(
    () => localStorage.getItem('pm-runner-ai-generate-plan-kind')
  );
  expect(stored).toBe('spec-first-tdd');
});
