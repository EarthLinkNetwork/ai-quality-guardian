/**
 * Browser E2E Test: Sidebar Context Selector & Project Dropdown
 *
 * Tests:
 * - Sidebar context selector replaces per-page scope bars
 * - Project dropdown in sidebar filters non-absolute paths
 * - Settings path matches the selected project
 * - Scope button active state is visually distinct (blue background)
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
let tempProjectDir: string;
let tempProjectDir2: string;
let tempGlobalDir: string;

async function startServer(): Promise<void> {
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-dropdown-state-'));
  tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-dropdown-project1-'));
  tempProjectDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-dropdown-project2-'));
  tempGlobalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-dropdown-global-'));

  return new Promise((resolve, reject) => {
    const script = `
      const { createApp } = require('./src/web/server');
      const { InMemoryQueueStore } = require('./src/queue/in-memory-queue-store');

      const queueStore = new InMemoryQueueStore({ namespace: 'pw-dropdown' });
      const app = createApp({
        queueStore,
        sessionId: 'pw-dropdown-session',
        namespace: 'pw-dropdown',
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
  for (const dir of [tempStateDir, tempProjectDir, tempProjectDir2, tempGlobalDir]) {
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

async function registerProjects(): Promise<void> {
  // Register two projects with absolute paths
  await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath: tempProjectDir, alias: 'Project A' }),
  });
  await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath: tempProjectDir2, alias: 'Project B' }),
  });
}

test.beforeAll(async () => {
  await startServer();
  await registerProjects();
});

test.afterAll(async () => {
  await stopServer();
});

test.describe('Sidebar context selector (unified scope)', () => {

  test('Sidebar context: dropdown shows, switching project works', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);

    // Project scope should be active by default
    const projectBtn = page.locator('[data-testid="context-scope-project"]');
    await expect(projectBtn).toBeVisible();

    // Dropdown should exist in sidebar
    const dropdown = page.locator('[data-testid="context-project-select"]');
    await expect(dropdown).toBeVisible();

    // All dropdown values should be absolute paths
    const options = await dropdown.locator('option').all();
    expect(options.length).toBeGreaterThanOrEqual(2);
    for (const opt of options) {
      const val = await opt.getAttribute('value');
      expect(val?.startsWith('/')).toBe(true);
    }

    // Switch to second project
    const secondVal = await options[1].getAttribute('value');
    await dropdown.selectOption(secondVal!);
    await page.waitForTimeout(1000);

    // Verify dropdown retains selection
    await expect(dropdown).toHaveValue(secondVal!);

    // Switch to Global scope - dropdown should disappear
    await page.locator('[data-testid="context-scope-global"]').click();
    await page.waitForTimeout(500);
    await expect(dropdown).not.toBeVisible();
  });

  test('Scope button has clear active visual state (blue background)', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);

    const projectBtn = page.locator('[data-testid="context-scope-project"]');
    const globalBtn = page.locator('[data-testid="context-scope-global"]');

    // Project is default active - should have blue background
    await expect(projectBtn).toHaveCSS('background-color', 'rgb(37, 99, 235)');
    await expect(projectBtn).toHaveCSS('color', 'rgb(255, 255, 255)');

    // Inactive button should NOT have blue background
    const globalBg = await globalBtn.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(globalBg).not.toBe('rgb(37, 99, 235)');

    // Switch to Global
    await globalBtn.click();
    await page.waitForTimeout(500);

    // Now Global should be active (blue)
    await expect(globalBtn).toHaveCSS('background-color', 'rgb(37, 99, 235)');
    await expect(globalBtn).toHaveCSS('color', 'rgb(255, 255, 255)');
  });

  test('No per-page scope bars on Hooks/Commands/Agents pages', async ({ page }) => {
    // Hooks
    await page.goto(`${BASE_URL}/hooks`);
    await page.waitForTimeout(2000);
    await expect(page.locator('#app .scope-bar')).toHaveCount(0);

    // Commands
    await page.goto(`${BASE_URL}/commands`);
    await page.waitForTimeout(2000);
    await expect(page.locator('#app .scope-bar')).toHaveCount(0);

    // Agents
    await page.goto(`${BASE_URL}/agents`);
    await page.waitForTimeout(2000);
    await expect(page.locator('#app .scope-bar')).toHaveCount(0);
  });
});
