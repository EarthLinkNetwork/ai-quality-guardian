/**
 * E2E Test: Repo Detector / Profile
 *
 * Verifies:
 * - GET /api/repo/profile returns valid profile
 * - Profile fields are correct for this Node/TS project
 * - Profile panel renders in /assistant page
 */

import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const TEST_PORT = 3600;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '../..');

let serverProcess: ChildProcess | null = null;
let tempStateDir: string;
let tempProjectDir: string;

async function startServer(): Promise<void> {
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-detector-state-'));
  tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-detector-project-'));

  // Create a fake package.json in tempProjectDir
  fs.writeFileSync(path.join(tempProjectDir, 'package.json'), JSON.stringify({
    name: 'test-repo',
    scripts: { test: 'vitest', lint: 'eslint .' },
    dependencies: { express: '^4.18.0' },
    devDependencies: { typescript: '^5.0.0', vitest: '^1.0.0', eslint: '^8.0.0', prettier: '^3.0.0' }
  }, null, 2));
  fs.writeFileSync(path.join(tempProjectDir, 'tsconfig.json'), '{}');
  fs.writeFileSync(path.join(tempProjectDir, 'package-lock.json'), '{}');
  fs.mkdirSync(path.join(tempProjectDir, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(tempProjectDir, '.github', 'workflows', 'ci.yml'), 'name: CI');
  fs.mkdirSync(path.join(tempProjectDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(tempProjectDir, 'test'), { recursive: true });

  return new Promise((resolve, reject) => {
    const script = `
      const { createApp } = require('./src/web/server');
      const { InMemoryQueueStore } = require('./src/queue/in-memory-queue-store');

      const queueStore = new InMemoryQueueStore({ namespace: 'pw-detector' });
      const app = createApp({
        queueStore,
        sessionId: 'pw-detector-session',
        namespace: 'pw-detector',
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

test('GET /api/repo/profile returns valid profile', async ({ page }) => {
  const resp = await page.request.get(`${BASE_URL}/api/repo/profile`);
  expect(resp.ok()).toBeTruthy();
  const profile = await resp.json();

  expect(profile.name).toBe('test-repo');
  expect(profile.type).toBe('node');
  expect(profile.language).toBe('typescript');
  expect(profile.hasTypeScript).toBe(true);
  expect(profile.packageManager).toBe('npm');
  expect(profile.testFramework).toBe('vitest');
  expect(profile.hasEslint).toBe(true);
  expect(profile.hasPrettier).toBe(true);
  expect(profile.hasCI).toBe(true);
  expect(profile.ciProvider).toBe('github-actions');
  expect(profile.detectedAt).toBeTruthy();
});

test('Profile includes scripts from package.json', async ({ page }) => {
  const resp = await page.request.get(`${BASE_URL}/api/repo/profile`);
  const profile = await resp.json();

  expect(profile.scripts.test).toBe('vitest');
  expect(profile.scripts.lint).toBe('eslint .');
});

test('Profile includes dependencies', async ({ page }) => {
  const resp = await page.request.get(`${BASE_URL}/api/repo/profile`);
  const profile = await resp.json();

  expect(profile.dependencies).toContain('express');
  expect(profile.devDependencies).toContain('typescript');
  expect(profile.devDependencies).toContain('vitest');
});

test('Profile includes directory structure', async ({ page }) => {
  const resp = await page.request.get(`${BASE_URL}/api/repo/profile`);
  const profile = await resp.json();

  expect(profile.dirs).toContain('src');
  expect(profile.dirs).toContain('test');
});

// ─── UI Tests ──────────────────────────────────────────────

test('Assistant page shows repo profile panel', async ({ page }) => {
  await page.goto(`${BASE_URL}/assistant`);
  await page.waitForSelector('[data-testid="repo-profile-panel"]');

  // Wait for profile to load
  await expect(page.locator('[data-testid="repo-profile-panel"]')).toContainText('test-repo', { timeout: 5000 });
  await expect(page.locator('[data-testid="repo-profile-panel"]')).toContainText('typescript');
  await expect(page.locator('[data-testid="repo-profile-panel"]')).toContainText('npm');
});

test('Assistant page has Propose and Quality tabs that switch content', async ({ page }) => {
  await page.goto(`${BASE_URL}/assistant`);

  const proposeTab = page.locator('[data-testid="tab-propose"]');
  const qualityTab = page.locator('[data-testid="tab-quality"]');
  await expect(proposeTab).toBeVisible();
  await expect(qualityTab).toBeVisible();

  // Verify tab labels
  await expect(proposeTab).toHaveText('Propose');
  await expect(qualityTab).toHaveText('Quality');

  // Click Quality tab and verify content changes
  await qualityTab.click();
  const tabContent = page.locator('#assistant-tab-content');
  // Quality tab renders evaluation buttons
  await expect(tabContent.locator('[data-testid="run-eval-btn"]')).toBeVisible();

  // Click Propose tab and verify content switches back
  await proposeTab.click();
  // Propose tab should NOT have the eval button
  await expect(tabContent.locator('[data-testid="run-eval-btn"]')).toHaveCount(0);
  // Propose tab renders the assistant layout (prompt area)
  await expect(tabContent.locator('.assistant-layout')).toBeVisible();
});
