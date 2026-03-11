/**
 * Browser E2E Test: Commands & Agents CRUD
 *
 * Tests:
 * - Commands: create, edit, delete, scope switch, persistence
 * - Agents: create agent, create skill, edit, scope independence
 * - Unsaved changes guard (Confirm dialog)
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

/**
 * Start the web server for testing with isolated temp dirs
 */
async function startServer(): Promise<void> {
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-cmd-agent-state-'));
  tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-cmd-agent-project-'));
  tempGlobalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-cmd-agent-global-'));

  return new Promise((resolve, reject) => {
    const script = `
      const { createApp } = require('./src/web/server');
      const { InMemoryQueueStore } = require('./src/queue/in-memory-queue-store');

      const queueStore = new InMemoryQueueStore({ namespace: 'pw-cmd-agent' });
      const app = createApp({
        queueStore,
        sessionId: 'pw-cmd-agent-session',
        namespace: 'pw-cmd-agent',
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
  for (const dir of [tempStateDir, tempProjectDir, tempGlobalDir]) {
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

/** Helper: click a confirm dialog's confirm button */
async function confirmDialog(page: Page) {
  const overlay = page.locator('.confirm-dialog-overlay');
  await overlay.waitFor({ state: 'visible', timeout: 5000 });
  await overlay.locator('[data-action="confirm"]').click();
  await overlay.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
}

/** Helper: dismiss a confirm dialog */
async function dismissDialog(page: Page) {
  const overlay = page.locator('.confirm-dialog-overlay');
  await overlay.waitFor({ state: 'visible', timeout: 5000 });
  await overlay.locator('[data-action="cancel"]').click();
  await overlay.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
}

/** Helper: wait for toast */
async function waitForToast(page: Page, text: string) {
  await expect(page.locator('.toast').filter({ hasText: text }).first()).toBeVisible({ timeout: 5000 });
}

// Use a single global setup/teardown
test.beforeAll(async () => {
  await startServer();
});

test.afterAll(async () => {
  await stopServer();
});

// ─── Commands CRUD ───────────────────────────────────────────────

test('Commands: create in global → save → listed → persists after reload', async ({ page }) => {
  await page.goto(`${BASE_URL}/commands`);
  await page.waitForSelector('[data-testid="cmd-two-pane"]');

  // Switch to global
  await page.click('[data-testid="cmd-scope-global"]');
  await page.waitForSelector('[data-testid="cmd-two-pane"]');

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
  await page.click('[data-testid="cmd-scope-global"]');
  await page.waitForSelector('[data-testid="cmd-list"]');
  await expect(page.locator('[data-testid="cmd-item-test-cmd"]')).toBeVisible();
});

test('Commands: edit → save → reflected', async ({ page }) => {
  await page.goto(`${BASE_URL}/commands`);
  await page.waitForSelector('[data-testid="cmd-two-pane"]');
  await page.click('[data-testid="cmd-scope-global"]');
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
  await page.click('[data-testid="cmd-scope-global"]');
  await page.waitForSelector('[data-testid="cmd-list"]');
  await page.click('[data-testid="cmd-item-test-cmd"]');
  await page.waitForSelector('[data-testid="cmd-editor"]');
  const content = await page.locator('[data-testid="cmd-editor"]').inputValue();
  expect(content).toContain('Updated Command');
});

test('Commands: delete → removed from list', async ({ page }) => {
  await page.goto(`${BASE_URL}/commands`);
  await page.waitForSelector('[data-testid="cmd-two-pane"]');
  await page.click('[data-testid="cmd-scope-global"]');
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
  await page.click('[data-testid="cmd-scope-project"]');
  await page.waitForSelector('[data-testid="cmd-list"]');
  await page.click('[data-testid="cmd-new-btn"]');
  await page.fill('[data-testid="cmd-new-name"]', 'proj-only');
  await page.fill('[data-testid="cmd-editor"]', '# Project Command');
  await page.click('[data-testid="cmd-create-btn"]');
  await confirmDialog(page);
  await waitForToast(page, 'created');
  await expect(page.locator('[data-testid="cmd-item-proj-only"]')).toBeVisible();

  // Switch to global - should NOT see proj-only
  await page.click('[data-testid="cmd-scope-global"]');
  await page.waitForSelector('[data-testid="cmd-list"]');
  await expect(page.locator('[data-testid="cmd-item-proj-only"]')).toHaveCount(0);

  // Switch back to project - should see proj-only
  await page.click('[data-testid="cmd-scope-project"]');
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
  await page.click('[data-testid="agent-scope-global"]');
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
  await page.click('[data-testid="agent-scope-global"]');
  await page.waitForSelector('[data-testid="agent-list"]');
  await page.click('[data-testid="agent-item-test-agent"]');
  await page.waitForSelector('[data-testid="agent-editor"]');
  const content = await page.locator('[data-testid="agent-editor"]').inputValue();
  expect(content).toContain('Updated Agent');
});

test('Agents: skill create → listed with type distinction', async ({ page }) => {
  await page.goto(`${BASE_URL}/agents`);
  await page.waitForSelector('[data-testid="agent-two-pane"]');
  await page.click('[data-testid="agent-scope-global"]');
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
  await page.click('[data-testid="agent-scope-project"]');
  await page.waitForSelector('[data-testid="agent-list"]');
  await page.click('[data-testid="agent-new-btn"]');
  await page.fill('[data-testid="agent-new-name"]', 'proj-agent');
  await page.fill('[data-testid="agent-editor"]', '# Project Agent');
  await page.click('[data-testid="agent-create-btn"]');
  await confirmDialog(page);
  await waitForToast(page, 'created');
  await expect(page.locator('[data-testid="agent-item-proj-agent"]')).toBeVisible();

  // Global: should NOT see proj-agent, SHOULD see test-agent
  await page.click('[data-testid="agent-scope-global"]');
  await page.waitForSelector('[data-testid="agent-list"]');
  await expect(page.locator('[data-testid="agent-item-proj-agent"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="agent-item-test-agent"]')).toBeVisible();

  // Project: should see proj-agent, NOT test-agent
  await page.click('[data-testid="agent-scope-project"]');
  await page.waitForSelector('[data-testid="agent-list"]');
  await expect(page.locator('[data-testid="agent-item-proj-agent"]')).toBeVisible();
  await expect(page.locator('[data-testid="agent-item-test-agent"]')).toHaveCount(0);
});

// ─── Unsaved Changes Guard ──────────────────────────────────────

test('Unsaved guard: confirm dialog on scope switch with dirty editor', async ({ page }) => {
  await page.goto(`${BASE_URL}/commands`);
  await page.waitForSelector('[data-testid="cmd-two-pane"]');

  // Create a command to work with
  await page.click('[data-testid="cmd-scope-project"]');
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

  // Make it dirty by typing
  await page.locator('[data-testid="cmd-editor"]').fill('# Modified content');

  // Try scope switch → should get unsaved changes dialog
  await page.click('[data-testid="cmd-scope-global"]');
  const overlay = page.locator('.confirm-dialog-overlay');
  await expect(overlay).toBeVisible({ timeout: 3000 });
  await expect(overlay).toContainText('Unsaved Changes');

  // Dismiss (Cancel) - should stay
  await dismissDialog(page);
  await expect(page.locator('[data-testid="cmd-item-guard-test"]')).toBeVisible();

  // Try again and confirm discard
  await page.click('[data-testid="cmd-scope-global"]');
  await expect(overlay).toBeVisible({ timeout: 3000 });
  await confirmDialog(page);

  // Should now be on global scope (guard-test not visible)
  await page.waitForSelector('[data-testid="cmd-list"]');
  await expect(page.locator('[data-testid="cmd-item-guard-test"]')).toHaveCount(0);
});
