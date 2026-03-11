/**
 * E2E Test: Golden Set Evaluation
 *
 * Verifies:
 * - GET /api/assistant/golden-set returns cases
 * - POST /api/assistant/evaluate (mock) returns report
 * - Quality tab renders in /assistant
 * - Eval results display in UI
 */

import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const TEST_PORT = 3602;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '../..');

let serverProcess: ChildProcess | null = null;
let tempStateDir: string;
let tempProjectDir: string;

async function startServer(): Promise<void> {
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-golden-state-'));
  tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-golden-project-'));

  return new Promise((resolve, reject) => {
    const script = `
      const { createApp } = require('./src/web/server');
      const { InMemoryQueueStore } = require('./src/queue/in-memory-queue-store');

      const queueStore = new InMemoryQueueStore({ namespace: 'pw-golden' });
      const app = createApp({
        queueStore,
        sessionId: 'pw-golden-session',
        namespace: 'pw-golden',
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

test('GET /api/assistant/golden-set returns cases', async ({ page }) => {
  const resp = await page.request.get(`${BASE_URL}/api/assistant/golden-set`);
  expect(resp.ok()).toBeTruthy();
  const data = await resp.json();

  expect(data.cases).toBeDefined();
  expect(data.total).toBeGreaterThanOrEqual(25);
  expect(data.cases[0].id).toBeTruthy();
  expect(data.cases[0].prompt).toBeTruthy();
  expect(data.cases[0].expectedArtifacts).toBeDefined();
});

test('Golden cases have required fields', async ({ page }) => {
  const resp = await page.request.get(`${BASE_URL}/api/assistant/golden-set`);
  const data = await resp.json();

  for (const c of data.cases) {
    expect(c.id).toMatch(/^gs-/);
    expect(typeof c.prompt).toBe('string');
    expect(Array.isArray(c.expectedArtifacts)).toBe(true);
    for (const ea of c.expectedArtifacts) {
      expect(ea.kind).toBeTruthy();
      expect(ea.namePattern).toBeTruthy();
    }
  }
});

test('POST /api/assistant/evaluate (mock) returns report', async ({ page }) => {
  const resp = await page.request.post(`${BASE_URL}/api/assistant/evaluate?mock=true`, {
    data: {}
  });
  expect(resp.ok()).toBeTruthy();
  const report = await resp.json();

  expect(report.reportId).toBeTruthy();
  expect(report.totalCases).toBeGreaterThanOrEqual(25);
  expect(report.passed).toBe(report.totalCases); // mock always passes
  expect(report.passRate).toBe(100);
  expect(report.results).toHaveLength(report.totalCases);
});

test('Evaluate with specific caseIds (mock)', async ({ page }) => {
  const resp = await page.request.post(`${BASE_URL}/api/assistant/evaluate?mock=true`, {
    data: { caseIds: ['gs-01', 'gs-02', 'gs-03'] }
  });
  expect(resp.ok()).toBeTruthy();
  const report = await resp.json();

  expect(report.totalCases).toBe(3);
  expect(report.results).toHaveLength(3);
  expect(report.results[0].caseId).toBe('gs-01');
});

test('Evaluate result items have correct structure', async ({ page }) => {
  const resp = await page.request.post(`${BASE_URL}/api/assistant/evaluate?mock=true`, {
    data: { caseIds: ['gs-01'] }
  });
  const report = await resp.json();
  const r = report.results[0];

  expect(r.caseId).toBe('gs-01');
  expect(r.prompt).toBeTruthy();
  expect(typeof r.pass).toBe('boolean');
  expect(typeof r.matchedArtifacts).toBe('number');
  expect(typeof r.expectedArtifacts).toBe('number');
  expect(Array.isArray(r.details)).toBe(true);
  expect(typeof r.durationMs).toBe('number');
});

// ─── UI Tests ──────────────────────────────────────────────

test('Quality tab shows golden evaluation UI', async ({ page }) => {
  await page.goto(`${BASE_URL}/assistant`);
  await page.waitForSelector('[data-testid="tab-quality"]');

  // Switch to Quality tab
  await page.click('[data-testid="tab-quality"]');

  await expect(page.locator('[data-testid="run-eval-btn"]')).toBeVisible();
  await expect(page.locator('[data-testid="load-golden-btn"]')).toBeVisible();
});

test('Load golden cases in UI', async ({ page }) => {
  await page.goto(`${BASE_URL}/assistant`);
  await page.click('[data-testid="tab-quality"]');

  await page.click('[data-testid="load-golden-btn"]');
  await expect(page.locator('[data-testid="golden-cases-list"]')).toContainText('gs-01', { timeout: 5000 });
  await expect(page.locator('[data-testid="golden-cases-list"]')).toContainText('cases loaded');
});

test('Run evaluation shows results in UI (mock)', async ({ page }) => {
  await page.goto(`${BASE_URL}/assistant?mock=true`);
  await page.click('[data-testid="tab-quality"]');

  await page.click('[data-testid="run-eval-btn"]');
  await expect(page.locator('[data-testid="eval-results"]')).toContainText('Pass Rate', { timeout: 15000 });
  await expect(page.locator('[data-testid="eval-results"]')).toContainText('100%');
  await expect(page.locator('[data-testid="eval-result-item"]').first()).toBeVisible();
});
