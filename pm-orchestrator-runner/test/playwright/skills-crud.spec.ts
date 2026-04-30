/**
 * Browser E2E Test: Skills CRUD on the dedicated /skills page
 *
 * Task B Q1=α: Skills is an independent page. This spec covers create /
 * edit / delete of a skill on /skills, migrated from the skill-create
 * block that used to live in commands-agents-crud.spec.ts.
 *
 * Q2=c: CRUD uses the existing /api/claude-files/agents/:scope endpoints
 * (shared with agents). /api/skills/generate is out of scope here.
 */

import { test, expect, Page } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const TEST_PORT = 3619;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '../..');

let serverProcess: ChildProcess | null = null;
let tempStateDir: string;
let tempProjectDir: string;
let tempGlobalDir: string;

async function startServer(): Promise<void> {
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-skills-crud-state-'));
  tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-skills-crud-proj-'));
  tempGlobalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-skills-crud-global-'));

  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'agents'), { recursive: true });
  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(tempGlobalDir, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(tempGlobalDir, 'skills'), { recursive: true });

  return new Promise((resolve, reject) => {
    const script = `
      const { createApp } = require('./src/web/server');
      const { InMemoryQueueStore } = require('./src/queue/in-memory-queue-store');

      const queueStore = new InMemoryQueueStore({ namespace: 'pw-skills-crud' });
      const app = createApp({
        queueStore,
        sessionId: 'pw-skills-crud-session',
        namespace: 'pw-skills-crud',
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

async function registerProject(): Promise<void> {
  await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath: tempProjectDir, alias: 'Test Project' }),
  });
}

async function confirmDialog(page: Page) {
  const overlay = page.locator('.confirm-dialog-overlay');
  await expect(overlay).toBeVisible({ timeout: 3000 });
  await overlay
    .locator('.confirm-dialog-actions button.btn-primary, .confirm-dialog-actions button.btn-danger')
    .click();
  await expect(overlay).not.toBeVisible({ timeout: 3000 });
}

async function waitForToast(page: Page, text: string) {
  await expect(page.locator('.toast-message', { hasText: text }).first()).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(1500);
}

async function switchScope(page: Page, scope: 'global' | 'project') {
  await page.click(`[data-testid="context-scope-${scope}"]`);
  await page.waitForTimeout(1500);
}

test.beforeAll(async () => {
  await startServer();
  await registerProject();
});

test.afterAll(async () => {
  await stopServer();
});

test('Skills: create on /skills → appears in list', async ({ page }) => {
  await page.goto(`${BASE_URL}/skills`);
  await page.waitForSelector('[data-testid="skill-two-pane"]');
  await switchScope(page, 'global');
  await page.waitForSelector('[data-testid="skill-list"]');

  await page.click('[data-testid="skill-new-btn"]');
  await page.waitForSelector('[data-testid="skill-new-name"]');
  await page.fill('[data-testid="skill-new-name"]', 'test-skill');
  await page.fill(
    '[data-testid="skill-editor"]',
    '---\nskill: test-skill\ntools:\n  - Read\n---\n\n# Test Skill'
  );

  await page.click('[data-testid="skill-create-btn"]');
  await confirmDialog(page);
  await waitForToast(page, 'created');

  await expect(page.locator('[data-testid="skill-item-test-skill"]')).toBeVisible();
});

test('Skills: edit existing skill → content persists', async ({ page }) => {
  await page.goto(`${BASE_URL}/skills`);
  await page.waitForSelector('[data-testid="skill-two-pane"]');
  await switchScope(page, 'global');
  await page.waitForSelector('[data-testid="skill-list"]');

  await page.click('[data-testid="skill-item-test-skill"]');
  await page.waitForSelector('[data-testid="skill-editor"]');
  await page.fill(
    '[data-testid="skill-editor"]',
    '---\nskill: test-skill\ntools:\n  - Read\n  - Grep\n---\n\n# Updated Skill'
  );
  await page.click('[data-testid="skill-save-btn"]');
  await confirmDialog(page);
  await waitForToast(page, 'saved');

  await page.reload();
  await page.waitForSelector('[data-testid="skill-two-pane"]');
  await switchScope(page, 'global');
  await page.waitForSelector('[data-testid="skill-list"]');
  await page.click('[data-testid="skill-item-test-skill"]');
  await page.waitForSelector('[data-testid="skill-editor"]');
  const content = await page.locator('[data-testid="skill-editor"]').inputValue();
  expect(content).toContain('Updated Skill');
});

test('Skills: /skills page does not list agents', async ({ page }) => {
  // Pre-seed an agent in global scope via the shared API
  const res = await fetch(`${BASE_URL}/api/claude-files/agents/global/agent/my-agent-guard`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '---\nskill: my-agent-guard\n---\n\n# Agent' }),
  });
  expect(res.status).toBe(200);

  await page.goto(`${BASE_URL}/skills`);
  await page.waitForSelector('[data-testid="skill-two-pane"]');
  await switchScope(page, 'global');
  await page.waitForSelector('[data-testid="skill-list"]');

  // The agent must not leak into the Skills list (Q1=α independence)
  await expect(page.locator('[data-testid="agent-item-my-agent-guard"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="skill-item-my-agent-guard"]')).toHaveCount(0);
});

test('Skills: delete skill removes it from the list', async ({ page }) => {
  await page.goto(`${BASE_URL}/skills`);
  await page.waitForSelector('[data-testid="skill-two-pane"]');
  await switchScope(page, 'global');
  await page.waitForSelector('[data-testid="skill-list"]');

  await page.click('[data-testid="skill-item-test-skill"]');
  await page.waitForSelector('[data-testid="skill-delete-btn"]');
  await page.click('[data-testid="skill-delete-btn"]');
  await confirmDialog(page);
  await waitForToast(page, 'deleted');

  await expect(page.locator('[data-testid="skill-item-test-skill"]')).toHaveCount(0);
});
