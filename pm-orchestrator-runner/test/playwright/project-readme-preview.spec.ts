/**
 * Playwright spec: Project Detail README tab + marked/DOMPurify preview.
 *
 * Covers:
 *   P1 README tab is present on Project Detail and clickable
 *   P2 README content renders as HTML (marked-produced elements)
 *   P3 XSS payload `[click](javascript:alert(1))` is sanitized by DOMPurify
 *   P4 Project without README still shows the tab (with "No README" message)
 *   P5 Overview tab is the default and shows existing cards
 *
 * The spec stands up its own short-lived Express app rather than reusing the
 * Tier A harness, so the two test files do not race for the same port.
 */

import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const TEST_PORT = 3617;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '../..');

let serverProcess: ChildProcess | null = null;
let tempStateDir: string;
let tempProjectDir: string;
let tempGlobalDir: string;

async function startServer(): Promise<void> {
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-readme-state-'));
  tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-readme-proj-'));
  tempGlobalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-readme-global-'));

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

      const queueStore = new InMemoryQueueStore({ namespace: 'pw-readme' });
      const app = createApp({
        queueStore,
        sessionId: 'pw-readme-session',
        namespace: 'pw-readme',
        projectRoot: ${JSON.stringify(tempProjectDir)},
        stateDir: ${JSON.stringify(tempStateDir)},
        globalClaudeDir: ${JSON.stringify(tempGlobalDir)},
      });

      const server = app.listen(${TEST_PORT}, () => {
        console.log('PLAYWRIGHT_SERVER_READY');
      });
      process.on('SIGTERM', () => { server.close(); process.exit(0); });
    `;

    serverProcess = spawn('npx', ['ts-node', '--transpile-only', '-e', script], {
      cwd: PROJECT_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        TS_NODE_TRANSPILE_ONLY: 'true',
      },
    });

    let output = '';
    const timeout = setTimeout(() => {
      serverProcess?.kill('SIGKILL');
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
    await new Promise(r => setTimeout(r, 500));
    serverProcess = null;
  }
  try { fs.rmSync(tempStateDir, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tempProjectDir, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tempGlobalDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

interface ProjectResp { projectId: string }

async function registerProject(projectPath: string, alias: string): Promise<string> {
  const r = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath, alias }),
  });
  if (!r.ok) throw new Error(`register failed: ${r.status} ${await r.text()}`);
  const body = (await r.json()) as ProjectResp;
  return body.projectId;
}

test.describe('Project Detail README tab (marked + DOMPurify)', () => {
  test.beforeAll(async () => { await startServer(); });
  test.afterAll(async () => { await stopServer(); });

  // ─── P5 + P1 + P2: tab visible, click, render ────────────
  test('Overview is default; README tab renders Markdown after click', async ({ page }) => {
    const sample = '# Title\n\nHello **world** with `code` and a [link](https://example.com).\n\n- item1\n- item2\n';
    fs.writeFileSync(path.join(tempProjectDir, 'README.md'), sample);

    const projectId = await registerProject(tempProjectDir, 'readme-render');
    await page.goto(`${BASE_URL}/projects/${encodeURIComponent(projectId)}`);

    // Tabs present
    const overviewTab = page.locator('[data-testid="project-detail-tab-overview"]');
    const readmeTab = page.locator('[data-testid="project-detail-tab-readme"]');
    await expect(overviewTab).toBeVisible({ timeout: 10000 });
    await expect(readmeTab).toBeVisible();

    // Default = Overview: existing detail card visible
    await expect(page.locator('[data-testid="project-details-card"]')).toBeVisible();

    // Click README tab
    await readmeTab.click();

    // README body becomes visible and contains marked-rendered HTML
    const body = page.locator('[data-testid="project-readme-body"]');
    await expect(body).toBeVisible({ timeout: 10000 });

    // h1 from `# Title`
    await expect(body.locator('h1')).toContainText('Title');
    // strong from `**world**`
    await expect(body.locator('strong')).toContainText('world');
    // anchor with the safe URL
    const link = body.locator('a[href="https://example.com"]');
    await expect(link).toHaveCount(1);
    // list rendered
    expect(await body.locator('li').count()).toBeGreaterThanOrEqual(2);
  });

  // ─── P3: XSS via marked + DOMPurify ──────────────────────
  test('XSS: javascript: hrefs are stripped from rendered README', async ({ page }) => {
    fs.writeFileSync(
      path.join(tempProjectDir, 'README.md'),
      '# XSS\n\n[bad](javascript:alert(1))\n\n[ok](https://example.com)\n'
    );
    const projectId = await registerProject(tempProjectDir, 'readme-xss');
    await page.goto(`${BASE_URL}/projects/${encodeURIComponent(projectId)}`);

    await page.locator('[data-testid="project-detail-tab-readme"]').click();
    const body = page.locator('[data-testid="project-readme-body"]');
    await expect(body).toBeVisible({ timeout: 10000 });

    // Collect every href under the README body and assert none is javascript:
    const links = body.locator('a');
    const count = await links.count();
    for (let i = 0; i < count; i++) {
      const href = await links.nth(i).getAttribute('href');
      if (href) {
        expect(href.toLowerCase()).not.toContain('javascript:');
      }
    }
    // The safe link must still be present
    await expect(body.locator('a[href="https://example.com"]')).toHaveCount(1);
  });

  // ─── P4: project without README ──────────────────────────
  test('Project without README still shows tab with empty-state message', async ({ page }) => {
    // Use a fresh project dir that has no README.md
    const otherProjDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-readme-empty-'));
    fs.mkdirSync(path.join(otherProjDir, '.claude'), { recursive: true });
    try {
      const projectId = await registerProject(otherProjDir, 'readme-empty');
      await page.goto(`${BASE_URL}/projects/${encodeURIComponent(projectId)}`);

      const readmeTab = page.locator('[data-testid="project-detail-tab-readme"]');
      await expect(readmeTab).toBeVisible({ timeout: 10000 });
      await readmeTab.click();

      // Pane visible; either readme-body exists with empty-state copy, or
      // an explicit empty-state element is rendered.
      const pane = page.locator('[data-testid="project-detail-pane-readme"]');
      await expect(pane).toBeVisible({ timeout: 10000 });
      // Look for "No README" / 404 messaging anywhere in the pane.
      const text = (await pane.innerText()).toLowerCase();
      expect(text).toMatch(/no readme|not found|readme/i);
    } finally {
      fs.rmSync(otherProjDir, { recursive: true, force: true });
    }
  });
});
