/**
 * E2E Test: Plugin Library / Marketplace
 *
 * Verifies:
 * - Plugin search endpoint with query, tags, category
 * - Plugin metadata (tags, category, author) saved and returned
 * - Bundle export/import
 * - Plugin Library UI with search bar and category filter
 * - Tags render in plugin list
 */

import { test, expect } from '@playwright/test';
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

async function startServer(): Promise<void> {
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-library-state-'));
  tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-library-project-'));

  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'commands'), { recursive: true });

  return new Promise((resolve, reject) => {
    const script = `
      const { createApp } = require('./src/web/server');
      const { InMemoryQueueStore } = require('./src/queue/in-memory-queue-store');

      const queueStore = new InMemoryQueueStore({ namespace: 'pw-library' });
      const app = createApp({
        queueStore,
        sessionId: 'pw-library-session',
        namespace: 'pw-library',
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

/** Helper to create a plugin via API */
async function createPlugin(page: any, overrides: Record<string, unknown> = {}) {
  const resp = await page.request.post(`${BASE_URL}/api/assistant/plugins`, {
    data: {
      name: 'Test Plugin',
      description: 'A test plugin',
      choice: {
        choiceId: 'choice-1',
        title: 'Test',
        summary: 'Test',
        scope: 'project',
        artifacts: [{ kind: 'command', name: 'lib-test-cmd', targetPathHint: '.claude/commands/lib-test-cmd.md', content: '# Test' }],
        applySteps: [],
        rollbackSteps: [],
        riskNotes: [],
        questions: []
      },
      tags: ['testing', 'ci'],
      category: 'testing',
      author: 'Test Author',
      ...overrides,
    }
  });
  return resp.json();
}

// ─── API Tests: Metadata ────────────────────────────────────

test('Plugin save includes marketplace metadata', async ({ page }) => {
  const plugin = await createPlugin(page);

  expect(plugin.pluginId).toBeTruthy();
  expect(plugin.tags).toEqual(['testing', 'ci']);
  expect(plugin.category).toBe('testing');
  expect(plugin.author).toBe('Test Author');
});

test('Plugin GET returns metadata', async ({ page }) => {
  const plugin = await createPlugin(page);
  const resp = await page.request.get(`${BASE_URL}/api/assistant/plugins/${plugin.pluginId}`);
  expect(resp.ok()).toBeTruthy();
  const fetched = await resp.json();

  expect(fetched.tags).toEqual(['testing', 'ci']);
  expect(fetched.category).toBe('testing');
  expect(fetched.author).toBe('Test Author');
});

// ─── API Tests: Search ──────────────────────────────────────

test('Search by query matches name', async ({ page }) => {
  await createPlugin(page, { name: 'Alpha Plugin', tags: ['alpha'] });
  await createPlugin(page, { name: 'Beta Plugin', tags: ['beta'] });

  const resp = await page.request.get(`${BASE_URL}/api/assistant/plugins/search?q=alpha`);
  expect(resp.ok()).toBeTruthy();
  const data = await resp.json();

  expect(data.items.some((p: any) => p.name === 'Alpha Plugin')).toBe(true);
  expect(data.items.every((p: any) => p.name.toLowerCase().includes('alpha') || (p.tags || []).some((t: string) => t.includes('alpha')))).toBe(true);
});

test('Search by category filters correctly', async ({ page }) => {
  await createPlugin(page, { name: 'Security Plugin', category: 'security', tags: ['sec'] });
  await createPlugin(page, { name: 'Testing Plugin', category: 'testing', tags: ['test'] });

  const resp = await page.request.get(`${BASE_URL}/api/assistant/plugins/search?category=security`);
  const data = await resp.json();

  expect(data.items.every((p: any) => p.category === 'security')).toBe(true);
});

test('Search by tags filters correctly', async ({ page }) => {
  await createPlugin(page, { name: 'Tagged Plugin', tags: ['unique-tag-xyz'] });

  const resp = await page.request.get(`${BASE_URL}/api/assistant/plugins/search?tags=unique-tag-xyz`);
  const data = await resp.json();

  expect(data.items.length).toBeGreaterThanOrEqual(1);
  expect(data.items.some((p: any) => (p.tags || []).includes('unique-tag-xyz'))).toBe(true);
});

// ─── API Tests: Bundle ──────────────────────────────────────

test('Bundle export returns all selected plugins', async ({ page }) => {
  const p1 = await createPlugin(page, { name: 'Bundle P1' });
  const p2 = await createPlugin(page, { name: 'Bundle P2' });

  const resp = await page.request.post(`${BASE_URL}/api/assistant/plugins/bundle/export`, {
    data: { pluginIds: [p1.pluginId, p2.pluginId] }
  });
  expect(resp.ok()).toBeTruthy();
  const bundle = await resp.json();

  expect(bundle.version).toBe('1.0');
  expect(bundle.exportedAt).toBeTruthy();
  expect(bundle.plugins).toHaveLength(2);
});

test('Bundle import creates new plugins with new IDs', async ({ page }) => {
  const original = await createPlugin(page, { name: 'Imported Plugin' });

  // Export
  const exportResp = await page.request.post(`${BASE_URL}/api/assistant/plugins/bundle/export`, {
    data: { pluginIds: [original.pluginId] }
  });
  const bundle = await exportResp.json();

  // Import
  const importResp = await page.request.post(`${BASE_URL}/api/assistant/plugins/bundle/import`, {
    data: { plugins: bundle.plugins }
  });
  expect(importResp.ok()).toBeTruthy();
  const importResult = await importResp.json();

  expect(importResult.imported).toBe(1);
  expect(importResult.plugins[0].pluginId).not.toBe(original.pluginId); // new ID
  expect(importResult.plugins[0].name).toBe('Imported Plugin');
});

// ─── UI Tests ──────────────────────────────────────────────

test('Plugin Library shows search bar and category filter', async ({ page }) => {
  await page.goto(`${BASE_URL}/plugins`);

  await expect(page.locator('[data-testid="plugin-search-input"]')).toBeVisible();
  await expect(page.locator('[data-testid="plugin-filter-category"]')).toBeVisible();
  await expect(page.locator('[data-testid="bundle-export-btn"]')).toBeVisible();
  await expect(page.locator('[data-testid="bundle-import-btn"]')).toBeVisible();
});

test('Plugin Library shows tags in plugin items', async ({ page }) => {
  // Create a plugin with tags first
  await createPlugin(page, { name: 'Visible Plugin', tags: ['visible-tag'] });

  await page.goto(`${BASE_URL}/plugins`);
  await page.waitForSelector('[data-testid="plugin-item"]', { timeout: 5000 });

  await expect(page.locator('[data-testid="plugin-tag"]').first()).toBeVisible();
});

test('Plugin Library search filters results', async ({ page }) => {
  await createPlugin(page, { name: 'Findable XYZ', tags: [] });
  await createPlugin(page, { name: 'Hidden ABC', tags: [] });

  await page.goto(`${BASE_URL}/plugins`);
  await page.waitForSelector('[data-testid="plugin-item"]', { timeout: 5000 });

  // Type in search
  await page.fill('[data-testid="plugin-search-input"]', 'Findable');
  // Wait for debounce
  await page.waitForTimeout(500);
  await expect(page.locator('[data-testid="plugins-list"]')).toContainText('Findable XYZ', { timeout: 3000 });
});
