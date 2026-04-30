/**
 * Browser E2E Test: Skills sidebar navigation
 *
 * Task B Q1=α: Skills is an independent sidebar entry separate from Agents.
 *
 * Verifies:
 * - The sidebar contains a Skills link (data-testid="nav-skills")
 * - Clicking the Skills link navigates to /skills
 * - The Skills page renders (distinct testid from Agents page)
 */

import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const TEST_PORT = 3618;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '../..');

let serverProcess: ChildProcess | null = null;
let tempStateDir: string;
let tempProjectDir: string;
let tempGlobalDir: string;

async function startServer(): Promise<void> {
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-skills-sidebar-state-'));
  tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-skills-sidebar-proj-'));
  tempGlobalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-skills-sidebar-global-'));

  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'agents'), { recursive: true });
  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(tempGlobalDir, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(tempGlobalDir, 'skills'), { recursive: true });

  return new Promise((resolve, reject) => {
    const script = `
      const { createApp } = require('./src/web/server');
      const { InMemoryQueueStore } = require('./src/queue/in-memory-queue-store');

      const queueStore = new InMemoryQueueStore({ namespace: 'pw-skills-sidebar' });
      const app = createApp({
        queueStore,
        sessionId: 'pw-skills-sidebar-session',
        namespace: 'pw-skills-sidebar',
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

test.beforeAll(async () => {
  await startServer();
});

test.afterAll(async () => {
  await stopServer();
});

test('Sidebar: Skills link is present and distinct from Agents', async ({ page }) => {
  await page.goto(`${BASE_URL}/`);
  await expect(page.locator('[data-testid="nav-agents"]')).toBeVisible();
  await expect(page.locator('[data-testid="nav-skills"]')).toBeVisible();
});

test('Sidebar: clicking Skills navigates to /skills and renders the Skills page', async ({ page }) => {
  await page.goto(`${BASE_URL}/`);
  await page.click('[data-testid="nav-skills"]');
  await expect(page).toHaveURL(/\/skills$/);
  // The Skills page has its own two-pane container (distinct testid from agents)
  await page.waitForSelector('[data-testid="skill-two-pane"]', { timeout: 5000 });
  await expect(page.locator('[data-testid="skill-two-pane"]')).toBeVisible();
});

test('Sidebar: /skills page does NOT render the agents two-pane', async ({ page }) => {
  await page.goto(`${BASE_URL}/skills`);
  await page.waitForSelector('[data-testid="skill-two-pane"]', { timeout: 5000 });
  // Agents two-pane must not appear on the Skills page (Q1=α independence)
  await expect(page.locator('[data-testid="agent-two-pane"]')).toHaveCount(0);
});
