/**
 * Browser E2E Test: Chat UX Navigation
 *
 * Tests:
 * - Projects list page has a "Chat" button per project card
 * - Task Groups list has a "Chat" button per group row (when project is linked)
 * - Sidebar "New Chat" button opens a project selection dialog
 */

import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const TEST_PORT = 3605;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '../..');

let serverProcess: ChildProcess | null = null;
let tempStateDir: string;
let tempProjectDir: string;
let tempGlobalDir: string;

async function startServer(): Promise<void> {
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-chat-nav-state-'));
  tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-chat-nav-proj-'));
  tempGlobalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-chat-nav-global-'));

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

      const queueStore = new InMemoryQueueStore({ namespace: 'pw-chat-nav' });
      const app = createApp({
        queueStore,
        sessionId: 'pw-chat-nav-session',
        namespace: 'pw-chat-nav',
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

/** Register a project and return its projectId */
async function registerProject(projectPath: string, alias: string): Promise<string> {
  const resp = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath, alias }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Failed to register project (${alias}): ${resp.status} ${body}`);
  }
  const data = await resp.json() as { projectId: string };
  return data.projectId;
}

/** Send a chat message to create a project-linked task group. Returns taskGroupId. */
async function sendChatMessage(projectId: string, content: string): Promise<string> {
  const resp = await fetch(`${BASE_URL}/api/projects/${encodeURIComponent(projectId)}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Failed to send chat to project ${projectId}: ${resp.status} ${body}`);
  }
  const data = await resp.json() as { taskGroupId?: string };
  if (!data.taskGroupId) {
    throw new Error('Chat response did not include taskGroupId');
  }
  return data.taskGroupId;
}

test.describe('Chat UX Navigation', () => {
  test.beforeAll(async () => {
    await startServer();
  });

  test.afterAll(async () => {
    await stopServer();
  });

  test('Projects list page has a Chat button for each project card', async ({ page }) => {
    const projectId = await registerProject(tempProjectDir, 'Test Project');

    // Navigate to the projects list page
    await page.goto(`${BASE_URL}/projects`);
    await page.waitForTimeout(1500);

    // The Chat button with data-testid="project-chat-btn" should be visible
    const chatBtn = page.locator('[data-testid="project-chat-btn"]').first();
    await expect(chatBtn).toBeVisible({ timeout: 5000 });

    // Clicking the Chat button should navigate to /chat/<projectId>
    await chatBtn.click();
    await page.waitForTimeout(1000);

    const currentUrl = page.url();
    expect(currentUrl).toContain('/chat/');
    expect(currentUrl).toContain(encodeURIComponent(projectId));
  });

  test('Task Groups list has a Chat button for project-linked groups', async ({ page }) => {
    const projectId = await registerProject(tempProjectDir, 'Chat Nav Project');

    // Create a task group via chat so it is linked to the project
    const taskGroupId = await sendChatMessage(projectId, 'Chat navigation test task');

    // Navigate to task-groups list page
    await page.goto(`${BASE_URL}/task-groups`);
    await page.waitForTimeout(1500);

    // Wait for the list to load and find the Chat button for project-linked groups
    // The button is rendered only when project_id !== 'N/A'
    const chatBtn = page.locator('[data-testid="tg-chat-btn"]').first();
    await expect(chatBtn).toBeVisible({ timeout: 5000 });

    // Clicking the Chat button navigates to /chat/<projectId>?taskGroupId=<taskGroupId>
    await chatBtn.click();
    await page.waitForTimeout(1000);

    const currentUrl = page.url();
    expect(currentUrl).toContain('/chat/');
    expect(currentUrl).toContain(encodeURIComponent(projectId));
    expect(currentUrl).toContain('taskGroupId=' + encodeURIComponent(taskGroupId));
  });

  test('Sidebar New Chat button opens project selection dialog', async ({ page }) => {
    await registerProject(tempProjectDir, 'Dialog Test Project');

    // Open any page
    await page.goto(`${BASE_URL}/`);
    await page.waitForTimeout(1000);

    // Click the "New Chat" nav item in the sidebar
    const newChatBtn = page.locator('[data-testid="nav-new-chat"]');
    await expect(newChatBtn).toBeVisible({ timeout: 5000 });
    await newChatBtn.click();
    await page.waitForTimeout(700);

    // The new-chat dialog overlay should be visible
    const dialogOverlay = page.locator('#new-chat-dialog-overlay');
    await expect(dialogOverlay).toBeVisible({ timeout: 5000 });

    // The dialog container itself should be visible
    const dialog = page.locator('#new-chat-dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // The dialog should contain the heading text
    const dialogText = await dialog.textContent();
    expect(dialogText).toContain('New Chat');

    // The project list area should exist (even if it shows loading or project items)
    const projectListArea = page.locator('#new-chat-project-list');
    await expect(projectListArea).toBeVisible({ timeout: 5000 });

    // Cancel button should be present and functional
    const cancelBtn = page.locator('#new-chat-cancel-btn');
    await expect(cancelBtn).toBeVisible({ timeout: 3000 });
    await cancelBtn.click();
    await page.waitForTimeout(500);

    // After cancel the overlay should be removed
    const overlayAfterCancel = page.locator('#new-chat-dialog-overlay');
    await expect(overlayAfterCancel).toHaveCount(0);
  });
});
