/**
 * Browser E2E Test: Sidebar Context Selector
 *
 * Phase 1: Unified context selector in CLAUDE CODE section
 *
 * Tests:
 * - Context selector visible in sidebar under CLAUDE CODE
 * - Switching context (Global/Project) persists across page navigation
 * - No per-page scope selectors on Hooks/Commands/Agents pages
 * - "AI Generate" appears in CLAUDE CODE section
 * - "Plugins" appears in CLAUDE CODE section
 * - All CLAUDE CODE pages use sidebar context for API calls
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
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-sidebar-state-'));
  tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-sidebar-proj1-'));
  tempProjectDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-sidebar-proj2-'));
  tempGlobalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-sidebar-global-'));

  // Create .claude dirs so APIs return something
  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'commands'), { recursive: true });
  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'agents'), { recursive: true });
  fs.mkdirSync(path.join(tempProjectDir2, '.claude', 'commands'), { recursive: true });
  fs.mkdirSync(path.join(tempProjectDir2, '.claude', 'agents'), { recursive: true });
  fs.mkdirSync(path.join(tempGlobalDir, 'commands'), { recursive: true });

  // Create a test agent file in project 1
  fs.writeFileSync(path.join(tempProjectDir, '.claude', 'agents', 'test-agent.md'), '# Test Agent\nHello');

  return new Promise((resolve, reject) => {
    const script = `
      const { createApp } = require('./src/web/server');
      const { InMemoryQueueStore } = require('./src/queue/in-memory-queue-store');

      const queueStore = new InMemoryQueueStore({ namespace: 'pw-sidebar' });
      const app = createApp({
        queueStore,
        sessionId: 'pw-sidebar-session',
        namespace: 'pw-sidebar',
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
  await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath: tempProjectDir, alias: 'Project Alpha' }),
  });
  await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath: tempProjectDir2, alias: 'Project Beta' }),
  });
}

test.beforeAll(async () => {
  await startServer();
  await registerProjects();
});

test.afterAll(async () => {
  await stopServer();
});

test.describe('Sidebar structure', () => {

  test('AI Generate link appears in CLAUDE CODE section', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);

    // "AI Generate" should be in sidebar
    const aiGenLink = page.locator('[data-testid="nav-ai-generate"]');
    await expect(aiGenLink).toBeVisible();
    await expect(aiGenLink).toContainText('AI Generate');
  });

  test('Plugins link appears in CLAUDE CODE section', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);

    const pluginsLink = page.locator('[data-testid="nav-plugins"]');
    await expect(pluginsLink).toBeVisible();

    // Plugins should be near Hooks/Commands/Agents (in CLAUDE CODE section)
    // and NOT in MANAGEMENT section
    const claudeCodeSection = page.locator('[data-testid="sidebar-section-claude-code"]');
    await expect(claudeCodeSection.locator('[data-testid="nav-plugins"]')).toBeVisible();
  });

  test('Assistant link no longer exists (renamed to AI Generate)', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);

    // Old "Assistant" nav item should not exist
    const assistantLink = page.locator('[data-testid="nav-assistant"]');
    await expect(assistantLink).toHaveCount(0);
  });
});

test.describe('Context selector in sidebar', () => {

  test('Context selector is visible in CLAUDE CODE section', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);

    const contextSelector = page.locator('[data-testid="claude-code-context"]');
    await expect(contextSelector).toBeVisible();

    // Should have Global and Project buttons
    const globalBtn = page.locator('[data-testid="context-scope-global"]');
    const projectBtn = page.locator('[data-testid="context-scope-project"]');
    await expect(globalBtn).toBeVisible();
    await expect(projectBtn).toBeVisible();
  });

  test('Project dropdown appears when Project scope is active', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);

    // Click Project scope
    await page.locator('[data-testid="context-scope-project"]').click();
    await page.waitForTimeout(500);

    const dropdown = page.locator('[data-testid="context-project-select"]');
    await expect(dropdown).toBeVisible();

    // Dropdown should contain registered projects with absolute paths
    const options = await dropdown.locator('option').all();
    expect(options.length).toBeGreaterThanOrEqual(2);
    for (const opt of options) {
      const val = await opt.getAttribute('value');
      expect(val?.startsWith('/')).toBe(true);
    }
  });

  test('Switching to Global hides project dropdown', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);

    // Ensure Project is active first
    await page.locator('[data-testid="context-scope-project"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('[data-testid="context-project-select"]')).toBeVisible();

    // Switch to Global
    await page.locator('[data-testid="context-scope-global"]').click();
    await page.waitForTimeout(500);

    await expect(page.locator('[data-testid="context-project-select"]')).not.toBeVisible();
  });

  test('Active scope button has blue styling', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);

    // Click Project
    await page.locator('[data-testid="context-scope-project"]').click();
    await page.waitForTimeout(500);

    const projectBtn = page.locator('[data-testid="context-scope-project"]');
    await expect(projectBtn).toHaveCSS('background-color', 'rgb(37, 99, 235)');
    await expect(projectBtn).toHaveCSS('color', 'rgb(255, 255, 255)');
  });
});

test.describe('Context persists across page navigation', () => {

  test('Selecting project in sidebar persists when navigating Hooks → Commands → Agents', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);

    // Set context to Project scope
    await page.locator('[data-testid="context-scope-project"]').click();
    await page.waitForTimeout(500);

    // Select second project if available
    const dropdown = page.locator('[data-testid="context-project-select"]');
    const options = await dropdown.locator('option').all();
    if (options.length >= 2) {
      const secondVal = await options[1].getAttribute('value');
      await dropdown.selectOption(secondVal!);
      await page.waitForTimeout(500);
    }
    const selectedProject = await dropdown.inputValue();

    // Navigate to Hooks
    await page.locator('[data-testid="nav-hooks"]').click();
    await page.waitForTimeout(1500);

    // Context should still show same project
    const dropdownAfterHooks = page.locator('[data-testid="context-project-select"]');
    await expect(dropdownAfterHooks).toHaveValue(selectedProject);

    // Navigate to Commands
    await page.locator('[data-testid="nav-commands"]').click();
    await page.waitForTimeout(1500);

    // Context should still show same project
    await expect(page.locator('[data-testid="context-project-select"]')).toHaveValue(selectedProject);

    // Navigate to Agents
    await page.locator('[data-testid="nav-agents"]').click();
    await page.waitForTimeout(1500);

    // Context should still show same project
    await expect(page.locator('[data-testid="context-project-select"]')).toHaveValue(selectedProject);
  });
});

test.describe('Per-page scope selectors removed', () => {

  test('Hooks page has no scope-bar', async ({ page }) => {
    await page.goto(`${BASE_URL}/hooks`);
    await page.waitForTimeout(2000);

    // Old scope bar should not exist on the page content
    const oldScopeBar = page.locator('.scope-bar');
    // The sidebar context selector exists, but NOT within the page content area
    const pageContent = page.locator('#app .scope-bar');
    await expect(pageContent).toHaveCount(0);
  });

  test('Commands page has no scope-bar', async ({ page }) => {
    await page.goto(`${BASE_URL}/commands`);
    await page.waitForTimeout(2000);

    const pageContent = page.locator('#app .scope-bar');
    await expect(pageContent).toHaveCount(0);
  });

  test('Agents page has no scope-bar', async ({ page }) => {
    await page.goto(`${BASE_URL}/agents`);
    await page.waitForTimeout(2000);

    const pageContent = page.locator('#app .scope-bar');
    await expect(pageContent).toHaveCount(0);
  });
});

test.describe('Pages use sidebar context for API calls', () => {

  test('Hooks page loads data matching sidebar context', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);

    // Set context to Project
    await page.locator('[data-testid="context-scope-project"]').click();
    await page.waitForTimeout(500);

    // Navigate to Hooks
    await page.locator('[data-testid="nav-hooks"]').click();
    await page.waitForTimeout(2000);

    // Page should show hooks path matching the context project
    const pathText = page.locator('[data-testid="hooks-path"]');
    if (await pathText.count() > 0) {
      const text = await pathText.textContent();
      const selectedProject = await page.locator('[data-testid="context-project-select"]').inputValue();
      expect(text).toContain(selectedProject);
    }
  });

  test('Agents page shows correct files for selected project', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);

    // Set context to Project scope
    await page.locator('[data-testid="context-scope-project"]').click();
    await page.waitForTimeout(500);

    // Explicitly select Project Alpha (tempProjectDir) which has test-agent.md
    const dropdown = page.locator('[data-testid="context-project-select"]');
    const options = await dropdown.locator('option').all();
    // Find the option that matches tempProjectDir (Project Alpha)
    for (const opt of options) {
      const text = await opt.textContent();
      if (text && text.includes('Project Alpha')) {
        const val = await opt.getAttribute('value');
        await dropdown.selectOption(val!);
        break;
      }
    }
    await page.waitForTimeout(500);

    // Navigate to Agents
    await page.locator('[data-testid="nav-agents"]').click();
    await page.waitForTimeout(2000);

    // Should see "test-agent" in the list (created in tempProjectDir)
    const agentItem = page.locator('[data-testid="agent-item-test-agent"]');
    await expect(agentItem).toBeVisible();
  });
});
