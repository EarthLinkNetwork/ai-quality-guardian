/**
 * Settings Route and API Key Status E2E Test (Playwright)
 *
 * Verifies with real browser rendering:
 * 1. GET /settings returns 200
 * 2. DOM shows "Configured" for both Anthropic and OpenAI
 * 3. After page reload, still shows "Configured"
 * 4. After server restart, still shows "Configured"
 * 5. No console errors
 */

import playwright from 'playwright';
const { chromium } = playwright;
type Browser = Awaited<ReturnType<typeof chromium.launch>>;
type BrowserContext = Awaited<ReturnType<Browser['newContext']>>;
type Page = Awaited<ReturnType<BrowserContext['newPage']>>;
import { spawn, ChildProcess, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { expect } from 'chai';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const TMP_DIR = path.join(PROJECT_ROOT, '.tmp');
const LOG_FILE = path.join(TMP_DIR, 'settings-playwright-e2e.log');

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

function log(message: string) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function clearLog() {
  fs.writeFileSync(LOG_FILE, '');
}

async function waitForServer(port: number, maxWaitMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const response = await fetch(`http://localhost:${port}/api/health`);
      if (response.ok) return true;
    } catch {
      // Not ready
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  return false;
}

describe('Settings Route Playwright E2E', function () {
  this.timeout(120000);

  let serverProcess: ChildProcess;
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  const PORT = 5701;
  const BASE_URL = `http://localhost:${PORT}`;
  const consoleErrors: string[] = [];

  async function startServer(): Promise<void> {
    serverProcess = spawn('node', ['dist/cli/index.js', 'web', '--port', String(PORT)], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, PM_WEB_NO_DYNAMODB: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess.stdout?.on('data', (data) => {
      log(`[SERVER] ${data.toString().trim()}`);
    });

    serverProcess.stderr?.on('data', (data) => {
      log(`[SERVER ERR] ${data.toString().trim()}`);
    });

    const ready = await waitForServer(PORT);
    if (!ready) throw new Error('Server failed to start');
    log('Server ready');
  }

  async function stopServer(): Promise<void> {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  before(async function () {
    clearLog();
    log('=== Settings Playwright E2E Test ===');

    // Kill existing
    try {
      execSync(`lsof -ti:${PORT} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch { /* ignore */ }

    // Build
    log('Building...');
    execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'pipe' });
    execSync('cp -r src/web/public dist/web/', { cwd: PROJECT_ROOT, stdio: 'pipe' });

    // Start server
    await startServer();

    // Set API keys
    log('Setting API keys...');
    await fetch(`${BASE_URL}/api/settings/api-key`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'anthropic', api_key: 'sk-ant-pw-test-key' }),
    });
    await fetch(`${BASE_URL}/api/settings/api-key`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'openai', api_key: 'sk-openai-pw-test-key' }),
    });
    log('API keys set');

    // Launch browser
    log('Launching browser...');
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      extraHTTPHeaders: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
    page = await context.newPage();

    // Capture console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
        log(`[CONSOLE ERROR] ${msg.text()}`);
      }
    });
    page.on('pageerror', err => {
      consoleErrors.push(err.message);
      log(`[PAGE ERROR] ${err.message}`);
    });

    log('Browser ready');
  });

  after(async function () {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await stopServer();
    log('=== Test Complete ===');
  });

  it('GET /settings returns 200 and API response captured', async function () {
    log('');
    log('=== TEST: /settings 200 + API response ===');

    let apiResponseCaptured = false;
    let apiResponseBody: any = null;

    // Intercept API response
    page.on('response', async (response) => {
      if (response.url().includes('/api/settings/api-key/status')) {
        log(`[RESPONSE] ${response.url()} -> ${response.status()}`);
        try {
          apiResponseBody = await response.json();
          log(`[RESPONSE BODY] ${JSON.stringify(apiResponseBody)}`);
          apiResponseCaptured = true;
        } catch { /* ignore */ }
      }
    });

    const response = await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle' });
    log(`Page status: ${response?.status()}`);

    expect(response?.status()).to.equal(200);

    // Wait for API call
    await page.waitForTimeout(1000);
    expect(apiResponseCaptured).to.equal(true, 'API response not captured');
    expect(apiResponseBody?.anthropic?.configured).to.equal(true);
    expect(apiResponseBody?.openai?.configured).to.equal(true);
  });

  it('DOM shows "Configured" for Anthropic and OpenAI', async function () {
    log('');
    log('=== TEST: DOM shows Configured ===');

    // Wait for render
    await page.waitForSelector('.settings-provider', { timeout: 5000 });

    // Get all status texts
    const statusTexts = await page.$$eval('.provider-status', (els) =>
      els.map(el => el.textContent?.trim())
    );
    log(`Status texts found: ${JSON.stringify(statusTexts)}`);

    // Check Anthropic
    const anthropicConfigured = await page.locator('text=Anthropic').locator('..').locator('.provider-status').textContent();
    log(`Anthropic status: ${anthropicConfigured}`);
    expect(anthropicConfigured?.trim()).to.equal('Configured');

    // Check OpenAI
    const openaiConfigured = await page.locator('text=OpenAI').locator('..').locator('.provider-status').textContent();
    log(`OpenAI status: ${openaiConfigured}`);
    expect(openaiConfigured?.trim()).to.equal('Configured');
  });

  it('After page reload, still shows Configured', async function () {
    log('');
    log('=== TEST: After reload ===');

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.settings-provider', { timeout: 5000 });

    const anthropicConfigured = await page.locator('text=Anthropic').locator('..').locator('.provider-status').textContent();
    log(`Anthropic after reload: ${anthropicConfigured}`);
    expect(anthropicConfigured?.trim()).to.equal('Configured');

    const openaiConfigured = await page.locator('text=OpenAI').locator('..').locator('.provider-status').textContent();
    log(`OpenAI after reload: ${openaiConfigured}`);
    expect(openaiConfigured?.trim()).to.equal('Configured');
  });

  it('After server restart, still shows Configured', async function () {
    log('');
    log('=== TEST: After server restart ===');

    // Stop server
    log('Stopping server...');
    await stopServer();

    // Restart
    log('Restarting server...');
    await startServer();

    // Navigate again
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.settings-provider', { timeout: 5000 });

    const anthropicConfigured = await page.locator('text=Anthropic').locator('..').locator('.provider-status').textContent();
    log(`Anthropic after restart: ${anthropicConfigured}`);
    expect(anthropicConfigured?.trim()).to.equal('Configured');

    const openaiConfigured = await page.locator('text=OpenAI').locator('..').locator('.provider-status').textContent();
    log(`OpenAI after restart: ${openaiConfigured}`);
    expect(openaiConfigured?.trim()).to.equal('Configured');
  });

  it('No console errors', async function () {
    log('');
    log('=== TEST: No console errors ===');
    log(`Console errors collected: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      log(`Errors: ${JSON.stringify(consoleErrors)}`);
    }
    expect(consoleErrors.length).to.equal(0, `Console errors: ${consoleErrors.join(', ')}`);
  });
});
