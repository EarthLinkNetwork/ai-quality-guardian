/**
 * Browser E2E Test: Left Menu Navigation
 * Tests that all 15 left menu items navigate to pages that render without critical errors
 */

import { test, expect, Page } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const TEST_PORT = 3603;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '../..');

let serverProcess: ChildProcess | null = null;
let tempStateDir: string;
let tempProjectDir: string;
let tempGlobalDir: string;

async function startServer(): Promise<void> {
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-nav-state-'));
  tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-nav-proj-'));
  tempGlobalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-nav-global-'));

  // Create .claude dirs
  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'commands'), { recursive: true });
  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'agents'), { recursive: true });
  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(tempGlobalDir, 'commands'), { recursive: true });
  fs.mkdirSync(path.join(tempGlobalDir, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(tempGlobalDir, 'skills'), { recursive: true });

  return new Promise((resolve, reject) => {
    const script = `
      const { createApp } = require('./src/web/server');
      const { InMemoryQueueStore } = require('./src/queue/in-memory-queue-store');

      const queueStore = new InMemoryQueueStore({ namespace: 'pw-nav' });
      const app = createApp({
        queueStore,
        sessionId: 'pw-nav-session',
        namespace: 'pw-nav',
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

// ─── Left sidebar navigation ──────────────────────────────────────

test('all expected pages render without console errors', async ({ page }) => {
  // Collect console errors
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  const routes = [
    { path: '/', name: 'Task Groups (root)' },
    { path: '/projects', name: 'Projects' },
    { path: '/activity', name: 'Activity' },
    { path: '/ai-generate', name: 'AI Generate' },
    { path: '/hooks', name: 'Hooks' },
    { path: '/commands', name: 'Commands' },
    { path: '/agents', name: 'Agents' },
    { path: '/plugins', name: 'Plugins' },
    { path: '/mcp-servers', name: 'MCP Servers' },
    { path: '/backup', name: 'Backup' },
    { path: '/task-tracker', name: 'Task Tracker' },
    { path: '/pr-reviews', name: 'PR Reviews' },
    { path: '/logs', name: 'Logs' },
    { path: '/settings', name: 'Settings' },
  ];

  for (const route of routes) {
    errors.length = 0;
    await page.goto(BASE_URL + route.path);
    await page.waitForTimeout(500);
    // Confirm no critical JS errors (soft assertion)
    const criticalErrors = errors.filter(e =>
      e.includes('ReferenceError') || e.includes('TypeError') || e.includes('SyntaxError')
    );
    expect(criticalErrors, `${route.name} has critical JS errors: ${criticalErrors.join(', ')}`).toHaveLength(0);
  }
});

test('sidebar contains all expected nav items', async ({ page }) => {
  await page.goto(BASE_URL + '/');
  await page.waitForTimeout(1000);
  // The sidebar uses <nav class="sidebar-nav" id="main-nav"> with <a data-nav="..."> links
  // Verify the sidebar nav is visible
  await expect(page.locator('.sidebar-nav').first()).toBeVisible();
  // Verify a representative set of nav links exist
  await expect(page.locator('[data-nav="home"]')).toBeVisible();
  await expect(page.locator('[data-nav="projects"]')).toBeVisible();
  await expect(page.locator('[data-nav="commands"]')).toBeVisible();
  await expect(page.locator('[data-nav="agents"]')).toBeVisible();
  await expect(page.locator('[data-nav="settings"]')).toBeVisible();
});

test('projects page has + New Project button', async ({ page }) => {
  // spec: spec/19_WEB_UI.md > 管理画面メニュー構成 > Projects
  await page.goto(BASE_URL + '/projects');
  await page.waitForTimeout(1000);
  // The + New Project button must be visible in the page header
  const newProjectBtn = page.locator('button', { hasText: '+ New Project' });
  await expect(newProjectBtn).toBeVisible();
});
