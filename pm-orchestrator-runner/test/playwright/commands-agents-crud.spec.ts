/**
 * Browser E2E Test: Commands & Agents CRUD
 *
 * Tests:
 * - Commands: create, edit, delete, scope switch, persistence
 * - Agents: create agent, create skill, edit, scope independence
 * - Unsaved changes guard (Confirm dialog)
 *
 * Scope is controlled via the unified sidebar context selector.
 */

import { test, expect, Page } from '@playwright/test';
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
let tempGlobalDir: string;

async function startServer(): Promise<void> {
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-crud-state-'));
  tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-crud-proj-'));
  tempGlobalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-crud-global-'));

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

      const queueStore = new InMemoryQueueStore({ namespace: 'pw-crud' });
      const app = createApp({
        queueStore,
        sessionId: 'pw-crud-session',
        namespace: 'pw-crud',
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

/** Click Confirm in dialog overlay */
async function confirmDialog(page: Page) {
  const overlay = page.locator('.confirm-dialog-overlay');
  await expect(overlay).toBeVisible({ timeout: 3000 });
  await overlay.locator('.confirm-dialog-actions button.btn-primary, .confirm-dialog-actions button.btn-danger').click();
  await expect(overlay).not.toBeVisible({ timeout: 3000 });
}

/** Click Cancel in dialog overlay */
async function dismissDialog(page: Page) {
  const overlay = page.locator('.confirm-dialog-overlay');
  await expect(overlay).toBeVisible({ timeout: 3000 });
  await overlay.locator('.confirm-dialog-actions button.btn-secondary').click();
  await expect(overlay).not.toBeVisible({ timeout: 3000 });
}

/** Wait for toast containing specific text, then wait for re-render */
async function waitForToast(page: Page, text: string) {
  await expect(page.locator('.toast-message', { hasText: text }).first()).toBeVisible({ timeout: 5000 });
  // Wait for async re-render after the API operation
  await page.waitForTimeout(1500);
}

/** Switch sidebar scope and wait for page to re-render */
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

// ─── Commands CRUD ───────────────────────────────────────────────

test('Commands: create in global → save → listed → persists after reload', async ({ page }) => {
  await page.goto(`${BASE_URL}/commands`);
  await page.waitForSelector('[data-testid="cmd-two-pane"]');

  // Switch to global via sidebar
  await switchScope(page, 'global');
  await page.waitForSelector('[data-testid="cmd-list"]');

  // Empty state visible
  await expect(page.locator('[data-testid="cmd-empty-state"]')).toBeVisible();

  // + New
  await page.click('[data-testid="cmd-new-btn"]');
  await page.waitForSelector('[data-testid="cmd-new-name"]');
  await page.fill('[data-testid="cmd-new-name"]', 'test-cmd');
  await page.fill('[data-testid="cmd-editor"]', '# Test Command\n\nDo something.\n\n$ARGUMENTS');

  // Create
  await page.click('[data-testid="cmd-create-btn"]');
  await confirmDialog(page);
  await waitForToast(page, 'created');

  // Listed
  await expect(page.locator('[data-testid="cmd-item-test-cmd"]')).toBeVisible();

  // Persists after reload
  await page.reload();
  await page.waitForSelector('[data-testid="cmd-two-pane"]');
  await switchScope(page, 'global');
  await page.waitForSelector('[data-testid="cmd-list"]');
  await expect(page.locator('[data-testid="cmd-item-test-cmd"]')).toBeVisible();
});

test('Commands: edit → save → reflected', async ({ page }) => {
  await page.goto(`${BASE_URL}/commands`);
  await page.waitForSelector('[data-testid="cmd-two-pane"]');
  await switchScope(page, 'global');
  await page.waitForSelector('[data-testid="cmd-list"]');

  // Select
  await page.click('[data-testid="cmd-item-test-cmd"]');
  await page.waitForSelector('[data-testid="cmd-save-btn"]');

  // Edit
  await page.fill('[data-testid="cmd-editor"]', '# Updated Command\n\nNew content.');

  // Save
  await page.click('[data-testid="cmd-save-btn"]');
  await confirmDialog(page);
  await waitForToast(page, 'saved');

  // Verify after reload
  await page.reload();
  await page.waitForSelector('[data-testid="cmd-two-pane"]');
  await switchScope(page, 'global');
  await page.waitForSelector('[data-testid="cmd-list"]');
  await page.click('[data-testid="cmd-item-test-cmd"]');
  await page.waitForSelector('[data-testid="cmd-editor"]');
  const content = await page.locator('[data-testid="cmd-editor"]').inputValue();
  expect(content).toContain('Updated Command');
});

test('Commands: delete → removed from list', async ({ page }) => {
  await page.goto(`${BASE_URL}/commands`);
  await page.waitForSelector('[data-testid="cmd-two-pane"]');
  await switchScope(page, 'global');
  await page.waitForSelector('[data-testid="cmd-list"]');

  await page.click('[data-testid="cmd-item-test-cmd"]');
  await page.waitForSelector('[data-testid="cmd-delete-btn"]');

  await page.click('[data-testid="cmd-delete-btn"]');
  await confirmDialog(page);
  await waitForToast(page, 'deleted');

  await expect(page.locator('[data-testid="cmd-item-test-cmd"]')).toHaveCount(0);
});

test('Commands: project/global scope independence', async ({ page }) => {
  await page.goto(`${BASE_URL}/commands`);
  await page.waitForSelector('[data-testid="cmd-two-pane"]');

  // Create in project
  await switchScope(page, 'project');
  await page.waitForSelector('[data-testid="cmd-list"]');
  await page.click('[data-testid="cmd-new-btn"]');
  await page.fill('[data-testid="cmd-new-name"]', 'proj-only');
  await page.fill('[data-testid="cmd-editor"]', '# Project Command');
  await page.click('[data-testid="cmd-create-btn"]');
  await confirmDialog(page);
  await waitForToast(page, 'created');
  await expect(page.locator('[data-testid="cmd-item-proj-only"]')).toBeVisible();

  // Switch to global - should NOT see proj-only
  await switchScope(page, 'global');
  await page.waitForSelector('[data-testid="cmd-list"]');
  await expect(page.locator('[data-testid="cmd-item-proj-only"]')).toHaveCount(0);

  // Switch back to project - should see proj-only
  await switchScope(page, 'project');
  await page.waitForSelector('[data-testid="cmd-list"]');
  await expect(page.locator('[data-testid="cmd-item-proj-only"]')).toBeVisible();

  // Cleanup
  await page.click('[data-testid="cmd-item-proj-only"]');
  await page.waitForSelector('[data-testid="cmd-delete-btn"]');
  await page.click('[data-testid="cmd-delete-btn"]');
  await confirmDialog(page);
});

// ─── Agents CRUD ─────────────────────────────────────────────────

test('Agents: agent create → save → listed → edit → save', async ({ page }) => {
  await page.goto(`${BASE_URL}/agents`);
  await page.waitForSelector('[data-testid="agent-two-pane"]');
  await switchScope(page, 'global');
  await page.waitForSelector('[data-testid="agent-list"]');

  // Empty state
  await expect(page.locator('[data-testid="agent-empty-state"]')).toBeVisible();

  // + New agent
  await page.click('[data-testid="agent-new-btn"]');
  await page.waitForSelector('[data-testid="agent-new-name"]');
  await page.fill('[data-testid="agent-new-name"]', 'test-agent');
  await page.fill('[data-testid="agent-editor"]', '---\nskill: test-agent\ntools:\n  - Read\n  - Grep\n---\n\n# Test Agent');

  await page.click('[data-testid="agent-create-btn"]');
  await confirmDialog(page);
  await waitForToast(page, 'created');
  await expect(page.locator('[data-testid="agent-item-test-agent"]')).toBeVisible();

  // Edit
  await page.fill('[data-testid="agent-editor"]', '---\nskill: test-agent\ntools:\n  - Read\n  - Grep\n  - Bash\n---\n\n# Updated Agent');
  await page.click('[data-testid="agent-save-btn"]');
  await confirmDialog(page);
  await waitForToast(page, 'saved');

  // Verify after reload
  await page.reload();
  await page.waitForSelector('[data-testid="agent-two-pane"]');
  await switchScope(page, 'global');
  await page.waitForSelector('[data-testid="agent-list"]');
  await page.click('[data-testid="agent-item-test-agent"]');
  await page.waitForSelector('[data-testid="agent-editor"]');
  const content = await page.locator('[data-testid="agent-editor"]').inputValue();
  expect(content).toContain('Updated Agent');
});

test('Agents: skill create → listed with type distinction', async ({ page }) => {
  await page.goto(`${BASE_URL}/agents`);
  await page.waitForSelector('[data-testid="agent-two-pane"]');
  await switchScope(page, 'global');
  await page.waitForSelector('[data-testid="agent-list"]');

  // + New → select skill
  await page.click('[data-testid="agent-new-btn"]');
  await page.waitForSelector('[data-testid="agent-new-type"]');
  await page.selectOption('[data-testid="agent-new-type"]', 'skill');
  await page.fill('[data-testid="agent-new-name"]', 'test-skill');
  await page.fill('[data-testid="agent-editor"]', '---\nskill: test-skill\ntools:\n  - Read\n---\n\n# Test Skill');

  await page.click('[data-testid="agent-create-btn"]');
  await confirmDialog(page);
  await waitForToast(page, 'created');

  // Both should be listed with different testids (agent-item vs skill-item)
  await expect(page.locator('[data-testid="agent-item-test-agent"]')).toBeVisible();
  await expect(page.locator('[data-testid="skill-item-test-skill"]')).toBeVisible();
});

test('Agents: project/global scope independence', async ({ page }) => {
  await page.goto(`${BASE_URL}/agents`);
  await page.waitForSelector('[data-testid="agent-two-pane"]');

  // Create in project
  await switchScope(page, 'project');
  await page.waitForSelector('[data-testid="agent-list"]');
  await page.click('[data-testid="agent-new-btn"]');
  await page.fill('[data-testid="agent-new-name"]', 'proj-agent');
  await page.fill('[data-testid="agent-editor"]', '# Project Agent');
  await page.click('[data-testid="agent-create-btn"]');
  await confirmDialog(page);
  await waitForToast(page, 'created');
  await expect(page.locator('[data-testid="agent-item-proj-agent"]')).toBeVisible();

  // Global: should NOT see proj-agent, SHOULD see test-agent
  await switchScope(page, 'global');
  await page.waitForSelector('[data-testid="agent-list"]');
  await expect(page.locator('[data-testid="agent-item-proj-agent"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="agent-item-test-agent"]')).toBeVisible();

  // Project: should see proj-agent, NOT test-agent
  await switchScope(page, 'project');
  await page.waitForSelector('[data-testid="agent-list"]');
  await expect(page.locator('[data-testid="agent-item-proj-agent"]')).toBeVisible();
  await expect(page.locator('[data-testid="agent-item-test-agent"]')).toHaveCount(0);
});

// ─── Unsaved Changes Guard ──────────────────────────────────────

test('Unsaved guard: confirm dialog on scope switch with dirty editor', async ({ page }) => {
  await page.goto(`${BASE_URL}/commands`);
  await page.waitForSelector('[data-testid="cmd-two-pane"]');

  // Create a command to work with
  await switchScope(page, 'project');
  await page.waitForSelector('[data-testid="cmd-list"]');
  await page.click('[data-testid="cmd-new-btn"]');
  await page.fill('[data-testid="cmd-new-name"]', 'guard-test');
  await page.fill('[data-testid="cmd-editor"]', '# Guard Test');
  await page.click('[data-testid="cmd-create-btn"]');
  await confirmDialog(page);
  await waitForToast(page, 'created');

  // Select it
  await page.click('[data-testid="cmd-item-guard-test"]');
  await page.waitForSelector('[data-testid="cmd-save-btn"]');

  // Make it dirty by dispatching input event (fill alone may not trigger oninput)
  const editor = page.locator('[data-testid="cmd-editor"]');
  await editor.fill('# Modified content');
  await editor.dispatchEvent('input');
  await page.waitForTimeout(200);

  // Try scope switch → should get unsaved changes dialog
  await page.click('[data-testid="context-scope-global"]');
  const overlay = page.locator('.confirm-dialog-overlay');
  await expect(overlay).toBeVisible({ timeout: 3000 });
  await expect(overlay).toContainText('Unsaved Changes');

  // Dismiss (Cancel) - should stay
  await dismissDialog(page);
  await expect(page.locator('[data-testid="cmd-item-guard-test"]')).toBeVisible();

  // Try again and confirm discard
  await page.click('[data-testid="context-scope-global"]');
  await expect(overlay).toBeVisible({ timeout: 3000 });
  await confirmDialog(page);

  // Should now be on global scope (guard-test not visible)
  await page.waitForTimeout(1500);
  await page.waitForSelector('[data-testid="cmd-list"]');
  await expect(page.locator('[data-testid="cmd-item-guard-test"]')).toHaveCount(0);
});
