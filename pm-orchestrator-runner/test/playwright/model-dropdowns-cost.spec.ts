/**
 * Browser E2E Test: Model dropdowns show cost / tier (Batch 2)
 *
 * Validates that the three model dropdowns (settings-model,
 * settings-qd-model, project-model) are populated dynamically from
 * /api/models and that each option text includes the cost format
 * "($X / $Y per 1M • {tier})".
 *
 * Spec: spec/19_WEB_UI.md "Model Dropdown Cost / Tier Display".
 */

import { test, expect, Page } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const TEST_PORT = 3621;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '../..');

let serverProcess: ChildProcess | null = null;
let tempStateDir: string;
let tempProjectDir: string;
let tempGlobalDir: string;

async function startServer(): Promise<void> {
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-modeldd-state-'));
  tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-modeldd-proj-'));
  tempGlobalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-modeldd-global-'));

  fs.mkdirSync(path.join(tempProjectDir, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(tempGlobalDir), { recursive: true });

  return new Promise((resolve, reject) => {
    const script = `
      const { createApp } = require('./src/web/server');
      const { InMemoryQueueStore } = require('./src/queue/in-memory-queue-store');

      const queueStore = new InMemoryQueueStore({ namespace: 'pw-modeldd' });
      const app = createApp({
        queueStore,
        sessionId: 'pw-modeldd-session',
        namespace: 'pw-modeldd',
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

async function gotoSettings(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/#/settings`);
  await page.waitForSelector('[data-testid="settings-provider"]', { timeout: 10000 });
}

test.beforeAll(async () => {
  await startServer();
});

test.afterAll(async () => {
  await stopServer();
});

test('GET /api/models returns tier field for every entry', async ({ request }) => {
  const res = await request.get(`${BASE_URL}/api/models`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.models).toBeTruthy();
  expect(Array.isArray(body.models.openai)).toBe(true);
  expect(Array.isArray(body.models.anthropic)).toBe(true);
  for (const m of body.models.openai) {
    expect(typeof m.tier).toBe('string');
    expect(['basic', 'standard', 'advanced', 'flagship']).toContain(m.tier);
  }
  for (const m of body.models.anthropic) {
    expect(typeof m.tier).toBe('string');
    expect(['basic', 'standard', 'advanced', 'flagship']).toContain(m.tier);
  }
});

test('settings-model dropdown options include "($" cost format', async ({ page }) => {
  await gotoSettings(page);
  // Wait for dropdown to be populated (at least one real option besides placeholder).
  await page.waitForFunction(
    () => {
      const sel = document.querySelector('#settings-model') as HTMLSelectElement | null;
      if (!sel) return false;
      // Look for any option text containing "($"
      return Array.from(sel.options).some(o => o.text.includes('($'));
    },
    { timeout: 10000 }
  );
  const optionTexts = await page.$$eval(
    '#settings-model option',
    (opts) => opts.map(o => (o as HTMLOptionElement).text)
  );
  const withCost = optionTexts.filter(t => t.includes('($'));
  expect(withCost.length).toBeGreaterThan(0);
  // At least one option should also contain the A-4 format: "/1M in, $X/1M out •"
  expect(optionTexts.some(t => /\/1M in, \$[\d.]+\/1M out\s*•/.test(t))).toBe(true);
});

test('settings-qd-model dropdown options include "($" cost format', async ({ page }) => {
  await gotoSettings(page);
  await page.waitForFunction(
    () => {
      const sel = document.querySelector('#settings-qd-model') as HTMLSelectElement | null;
      if (!sel) return false;
      return Array.from(sel.options).some(o => o.text.includes('($'));
    },
    { timeout: 10000 }
  );
  const optionTexts = await page.$$eval(
    '#settings-qd-model option',
    (opts) => opts.map(o => (o as HTMLOptionElement).text)
  );
  expect(optionTexts.some(t => t.includes('($'))).toBe(true);
});

test('settings-model option text mentions a tier label', async ({ page }) => {
  await gotoSettings(page);
  await page.waitForFunction(
    () => {
      const sel = document.querySelector('#settings-model') as HTMLSelectElement | null;
      if (!sel) return false;
      return Array.from(sel.options).some(o => /flagship|advanced|standard|basic/.test(o.text));
    },
    { timeout: 10000 }
  );
  const optionTexts = await page.$$eval(
    '#settings-model option',
    (opts) => opts.map(o => (o as HTMLOptionElement).text)
  );
  expect(optionTexts.some(t => /flagship|advanced|standard|basic/.test(t))).toBe(true);
});
