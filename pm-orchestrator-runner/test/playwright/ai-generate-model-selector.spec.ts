/**
 * Browser E2E Test: AI Generate model selector (Batch 3)
 *
 * Validates that the /ai-generate page exposes provider + model selectors,
 * persists the choice in localStorage, and shows the cost / tier format
 * inherited from Batch 2 populateModelDropdown helper.
 *
 * Spec: spec/37_AI_GENERATE.md §5 "Model Override Flow (UI)"
 */

import { test, expect, Page } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const TEST_PORT = 3622;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '../..');

let serverProcess: ChildProcess | null = null;
let tempStateDir: string;
let tempProjectDir: string;
let tempGlobalDir: string;

async function startServer(): Promise<void> {
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-aigen-state-'));
  tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-aigen-proj-'));
  tempGlobalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-aigen-global-'));

  fs.mkdirSync(path.join(tempProjectDir, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(tempGlobalDir), { recursive: true });

  return new Promise((resolve, reject) => {
    const script = `
      const { createApp } = require('./src/web/server');
      const { InMemoryQueueStore } = require('./src/queue/in-memory-queue-store');

      const queueStore = new InMemoryQueueStore({ namespace: 'pw-aigen' });
      const app = createApp({
        queueStore,
        sessionId: 'pw-aigen-session',
        namespace: 'pw-aigen',
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
  await page.goto(`${BASE_URL}/#/ai-generate`);
  await page.waitForSelector('[data-testid="ai-generate-provider"]', { timeout: 10000 });
}

test.beforeAll(async () => {
  await startServer();
});

test.afterAll(async () => {
  await stopServer();
});

test('provider and model selects are visible on /ai-generate', async ({ page }) => {
  await gotoAiGenerate(page);
  await expect(page.locator('[data-testid="ai-generate-provider"]')).toBeVisible();
  await expect(page.locator('[data-testid="ai-generate-model"]')).toBeVisible();
});

test('model dropdown is populated with cost/tier format', async ({ page }) => {
  await gotoAiGenerate(page);
  await page.waitForFunction(
    () => {
      const sel = document.querySelector('#ai-generate-model') as HTMLSelectElement | null;
      if (!sel) return false;
      return Array.from(sel.options).some(o => o.text.includes('($'));
    },
    { timeout: 10000 }
  );
  const optionTexts = await page.$$eval(
    '#ai-generate-model option',
    (opts) => opts.map(o => (o as HTMLOptionElement).text)
  );
  expect(optionTexts.some(t => /per 1M\s*•/.test(t))).toBe(true);
});

test('selecting a model persists in localStorage', async ({ page }) => {
  await gotoAiGenerate(page);
  // Wait for population
  await page.waitForFunction(
    () => {
      const sel = document.querySelector('#ai-generate-model') as HTMLSelectElement | null;
      return sel ? Array.from(sel.options).some(o => o.value && o.text.includes('($')) : false;
    },
    { timeout: 10000 }
  );

  // Pick the first concrete option (skip placeholder if any)
  const firstRealValue = await page.$eval('#ai-generate-model', (sel) => {
    const s = sel as HTMLSelectElement;
    for (const o of Array.from(s.options)) {
      if (o.value) return o.value;
    }
    return '';
  });
  expect(firstRealValue).not.toBe('');

  await page.selectOption('#ai-generate-model', firstRealValue);

  const storedModel = await page.evaluate(
    () => localStorage.getItem('pm-runner-ai-generate-model')
  );
  expect(storedModel).toBe(firstRealValue);
});

test('changing provider re-populates model dropdown with that provider only', async ({ page }) => {
  await gotoAiGenerate(page);
  await page.waitForFunction(
    () => {
      const sel = document.querySelector('#ai-generate-model') as HTMLSelectElement | null;
      return sel ? Array.from(sel.options).some(o => o.value && o.text.includes('($')) : false;
    },
    { timeout: 10000 }
  );

  await page.selectOption('#ai-generate-provider', 'anthropic');

  // Wait for repopulation: every concrete option should now start with "claude-"
  await page.waitForFunction(
    () => {
      const sel = document.querySelector('#ai-generate-model') as HTMLSelectElement | null;
      if (!sel) return false;
      const concrete = Array.from(sel.options).filter(o => o.value);
      if (concrete.length === 0) return false;
      return concrete.every(o => o.value.startsWith('claude-'));
    },
    { timeout: 10000 }
  );

  const storedProvider = await page.evaluate(
    () => localStorage.getItem('pm-runner-ai-generate-provider')
  );
  expect(storedProvider).toBe('anthropic');
});
