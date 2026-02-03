/**
 * Settings UI Diagnostic Check (Playwright)
 *
 * Verifies the Settings page UI renders correctly and has no console errors.
 * Runs as part of gate:web to catch UI regressions.
 *
 * CRITICAL: This test uses isolated stateDir to prevent polluting real user state.
 * E2E tests MUST NOT write to .claude/state/<real-namespace>/
 */

import playwright from 'playwright';
const { chromium } = playwright;
import { spawn, ChildProcess, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const TMP_DIR = path.join(PROJECT_ROOT, '.tmp');
const LOG_FILE = path.join(TMP_DIR, 'gate-settings-ui.log');

// E2E isolation: unique stateDir per test run
const E2E_RUN_ID = crypto.randomBytes(4).toString('hex');
const E2E_STATE_DIR = path.join(TMP_DIR, 'e2e-state', `run-${E2E_RUN_ID}`);
const E2E_NAMESPACE = `e2e-test-${E2E_RUN_ID}`;

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

interface CheckResult {
  name: string;
  passed: boolean;
  reason?: string;
}

/**
 * Clean up E2E state directory
 */
function cleanupE2eState() {
  if (fs.existsSync(E2E_STATE_DIR)) {
    try {
      fs.rmSync(E2E_STATE_DIR, { recursive: true, force: true });
      log(`[CLEANUP] Removed E2E stateDir: ${E2E_STATE_DIR}`);
    } catch (err) {
      log(`[CLEANUP] Failed to remove E2E stateDir: ${err}`);
    }
  }
}

/**
 * Check real stateDir for test key pollution and clean if found
 */
function checkAndCleanRealState() {
  // Find real stateDir by deriving from project path
  // Pattern: .claude/state/<namespace>/api-keys.json
  const stateBaseDir = path.join(PROJECT_ROOT, '.claude', 'state');

  if (!fs.existsSync(stateBaseDir)) {
    return;
  }

  const namespaces = fs.readdirSync(stateBaseDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const ns of namespaces) {
    // Skip E2E namespaces
    if (ns.startsWith('e2e-test-')) continue;

    const apiKeysFile = path.join(stateBaseDir, ns, 'api-keys.json');
    if (!fs.existsSync(apiKeysFile)) continue;

    try {
      const content = fs.readFileSync(apiKeysFile, 'utf-8');
      const keys = JSON.parse(content);
      let modified = false;

      // Check for test keys (gate-test pattern)
      for (const provider of ['anthropic', 'openai']) {
        if (keys[provider]?.key?.includes('gate-test')) {
          log(`[POLLUTION DETECTED] Found test key in ${apiKeysFile} for ${provider}`);
          delete keys[provider];
          modified = true;
        }
      }

      if (modified) {
        if (Object.keys(keys).length === 0) {
          fs.unlinkSync(apiKeysFile);
          log(`[CLEANUP] Removed polluted api-keys.json: ${apiKeysFile}`);
        } else {
          fs.writeFileSync(apiKeysFile, JSON.stringify(keys, null, 2));
          log(`[CLEANUP] Cleaned test keys from: ${apiKeysFile}`);
        }
      }
    } catch (err) {
      log(`[WARNING] Failed to check/clean ${apiKeysFile}: ${err}`);
    }
  }
}

async function runChecks(): Promise<void> {
  clearLog();
  console.log('\n=== Settings UI Diagnostic Check (Playwright) ===\n');

  // First, check and clean any existing pollution
  log('[STARTUP] Checking for existing state pollution...');
  checkAndCleanRealState();

  const PORT = 5702;
  const BASE_URL = `http://localhost:${PORT}`;
  const results: CheckResult[] = [];
  const consoleErrors: string[] = [];

  let serverProcess: ChildProcess | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    // Kill any existing server on this port
    try {
      execSync(`lsof -ti:${PORT} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch { /* ignore */ }

    // Create E2E stateDir
    fs.mkdirSync(E2E_STATE_DIR, { recursive: true });
    log(`[E2E] Created isolated stateDir: ${E2E_STATE_DIR}`);
    log(`[E2E] Namespace: ${E2E_NAMESPACE}`);

    // Build
    log('Building...');
    execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'pipe' });
    execSync('cp -r src/web/public dist/web/', { cwd: PROJECT_ROOT, stdio: 'pipe' });

    // Start server with E2E isolation
    log('Starting server with E2E isolation...');
    log(`[E2E] Server process: node dist/cli/index.js web --port ${PORT}`);
    log(`[E2E] PM_E2E_STATE_DIR=${E2E_STATE_DIR}`);

    serverProcess = spawn('node', ['dist/cli/index.js', 'web', '--port', String(PORT)], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        PM_WEB_NO_DYNAMODB: '1',
        PM_E2E_STATE_DIR: E2E_STATE_DIR,  // CRITICAL: isolate state
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess.stdout?.on('data', (data) => {
      const text = data.toString().trim();
      log(`[SERVER] ${text}`);
      // Verify E2E mode is active
      if (text.includes('[E2E MODE]')) {
        log('[E2E] Server confirmed E2E isolation mode');
      }
    });

    serverProcess.stderr?.on('data', (data) => {
      log(`[SERVER ERR] ${data.toString().trim()}`);
    });

    const ready = await waitForServer(PORT);
    if (!ready) {
      throw new Error('Server failed to start');
    }
    log('Server ready');

    // Verify server is using E2E stateDir by checking health endpoint
    const healthResp = await fetch(`${BASE_URL}/api/health`);
    const healthData = await healthResp.json() as { namespace?: string };
    log(`[E2E] Server namespace: ${healthData.namespace}`);

    // Set API keys for testing (these go to E2E_STATE_DIR, not real state)
    log('Setting API keys (to isolated E2E stateDir)...');
    await fetch(`${BASE_URL}/api/settings/api-key`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'anthropic', api_key: 'sk-ant-gate-test-e2e' }),
    });
    await fetch(`${BASE_URL}/api/settings/api-key`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'openai', api_key: 'sk-openai-gate-test-e2e' }),
    });
    log('API keys set to E2E stateDir');

    // Verify keys went to E2E stateDir, not real state
    const e2eApiKeysFile = path.join(E2E_STATE_DIR, 'api-keys.json');
    if (fs.existsSync(e2eApiKeysFile)) {
      log(`[E2E VERIFY] API keys written to isolated stateDir: ${e2eApiKeysFile}`);
    } else {
      log(`[E2E WARNING] API keys file not found in E2E stateDir`);
    }

    // Launch browser
    log('Launching browser...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      extraHTTPHeaders: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
    const page = await context.newPage();

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

    // Check 1: /settings returns 200
    log('Navigating to /settings...');
    const response = await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle' });
    const status = response?.status() || 0;
    log(`Page status: ${status}`);

    results.push({
      name: 'SETTINGS-1: /settings returns 200',
      passed: status === 200,
      reason: status === 200 ? undefined : `Got ${status}`,
    });

    // Wait for render
    await page.waitForTimeout(500);

    // Get page HTML for debugging
    const pageHtml = await page.content();
    const hasFullSettingsMarker = pageHtml.includes('class="settings-provider"') || pageHtml.includes('settings-list');
    log(`[DOM] Full Settings UI marker present: ${hasFullSettingsMarker}`);

    // Check 2: Page title or heading contains "Settings"
    const hasSettingsHeading = await page.$('h2:has-text("Settings"), h3:has-text("Settings")');
    results.push({
      name: 'SETTINGS-2: Settings heading exists',
      passed: !!hasSettingsHeading,
      reason: hasSettingsHeading ? undefined : 'No Settings heading found',
    });

    // Check 3: API Keys section exists
    const hasApiKeysSection = await page.$('h3:has-text("API Keys"), h2:has-text("API Keys")');
    results.push({
      name: 'SETTINGS-3: API Keys section exists',
      passed: !!hasApiKeysSection,
      reason: hasApiKeysSection ? undefined : 'No API Keys section found',
    });

    // Check 4: Anthropic provider exists
    const hasAnthropic = await page.$('text=Anthropic');
    results.push({
      name: 'SETTINGS-4: Anthropic provider exists',
      passed: !!hasAnthropic,
      reason: hasAnthropic ? undefined : 'Anthropic not found',
    });

    // Check 5: OpenAI provider exists
    const hasOpenAI = await page.$('text=OpenAI');
    results.push({
      name: 'SETTINGS-5: OpenAI provider exists',
      passed: !!hasOpenAI,
      reason: hasOpenAI ? undefined : 'OpenAI not found',
    });

    // Check 6: "Configured" status is displayed (both providers configured)
    const configuredElements = await page.$$('text=Configured');
    const configuredCount = configuredElements.length;
    log(`Found ${configuredCount} "Configured" elements`);
    results.push({
      name: 'SETTINGS-6: Both providers show "Configured"',
      passed: configuredCount >= 2,
      reason: configuredCount >= 2 ? undefined : `Only ${configuredCount} Configured elements found`,
    });

    // Check 7: No console errors (STRICT: 0 errors required)
    log(`Console errors collected: ${consoleErrors.length}`);
    results.push({
      name: 'SETTINGS-7: No console errors (0 required)',
      passed: consoleErrors.length === 0,
      reason: consoleErrors.length === 0 ? undefined : `${consoleErrors.length} errors: ${consoleErrors.join(', ')}`,
    });

    // Check 8: Settings UI structure (not simplified)
    // The full Settings UI should have .settings-list and .settings-provider classes
    const hasSettingsList = await page.$('.settings-list');
    const hasSettingsProvider = await page.$('.settings-provider');
    const hasProviderHeader = await page.$('.provider-header');
    const hasProviderStatus = await page.$('.provider-status');

    const fullUiPresent = !!hasSettingsList && !!hasSettingsProvider && !!hasProviderHeader && !!hasProviderStatus;
    log(`[DOM] .settings-list: ${!!hasSettingsList}, .settings-provider: ${!!hasSettingsProvider}, .provider-header: ${!!hasProviderHeader}, .provider-status: ${!!hasProviderStatus}`);

    results.push({
      name: 'SETTINGS-8: Full Settings UI structure (not simplified)',
      passed: fullUiPresent,
      reason: fullUiPresent ? undefined : 'Missing required CSS classes: settings-list, settings-provider, provider-header, provider-status',
    });

    // Check 9: After page reload, still works
    log('Reloading page...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    const configuredAfterReload = await page.$$('text=Configured');
    results.push({
      name: 'SETTINGS-9: After reload, providers still Configured',
      passed: configuredAfterReload.length >= 2,
      reason: configuredAfterReload.length >= 2 ? undefined : `Only ${configuredAfterReload.length} after reload`,
    });

    // Check 10: Navigation link exists
    const hasNavLink = await page.$('a[data-nav="settings"]');
    results.push({
      name: 'SETTINGS-10: Settings nav link exists',
      passed: !!hasNavLink,
      reason: hasNavLink ? undefined : 'No Settings navigation link found',
    });

    // Check 11: data-testid="settings-root" exists (G4 requirement)
    const hasSettingsRoot = await page.$('[data-testid="settings-root"]');
    log(`[DOM] data-testid="settings-root": ${!!hasSettingsRoot}`);
    results.push({
      name: 'SETTINGS-11: data-testid="settings-root" exists',
      passed: !!hasSettingsRoot,
      reason: hasSettingsRoot ? undefined : 'Missing data-testid="settings-root" - Settings page not rendered',
    });

    // Check 12: data-testid="settings-apikeys" exists (G4 requirement)
    const hasSettingsApikeys = await page.$('[data-testid="settings-apikeys"]');
    log(`[DOM] data-testid="settings-apikeys": ${!!hasSettingsApikeys}`);
    results.push({
      name: 'SETTINGS-12: data-testid="settings-apikeys" exists',
      passed: !!hasSettingsApikeys,
      reason: hasSettingsApikeys ? undefined : 'Missing data-testid="settings-apikeys" - API Keys section not rendered',
    });

    // Check 13: Full Settings UI - tabs exist
    const hasSettingsTabs = await page.$('[data-testid="settings-tabs"]');
    log(`[DOM] data-testid="settings-tabs": ${!!hasSettingsTabs}`);
    results.push({
      name: 'SETTINGS-13: Settings tabs (Global/Project) exist',
      passed: !!hasSettingsTabs,
      reason: hasSettingsTabs ? undefined : 'Missing settings tabs - Full UI not rendered',
    });

    // Check 14: Full Settings UI - provider select exists
    const hasProviderSelect = await page.$('[data-testid="settings-provider"]');
    log(`[DOM] data-testid="settings-provider": ${!!hasProviderSelect}`);
    results.push({
      name: 'SETTINGS-14: Provider select exists',
      passed: !!hasProviderSelect,
      reason: hasProviderSelect ? undefined : 'Missing provider select - API Keys only UI detected',
    });

    // Check 15: Full Settings UI - model select exists
    const hasModelSelect = await page.$('[data-testid="settings-model"]');
    log(`[DOM] data-testid="settings-model": ${!!hasModelSelect}`);
    results.push({
      name: 'SETTINGS-15: Model select exists',
      passed: !!hasModelSelect,
      reason: hasModelSelect ? undefined : 'Missing model select - API Keys only UI detected',
    });

    // Check 16: Full Settings UI - max tokens input exists
    const hasMaxTokens = await page.$('[data-testid="settings-max-tokens"]');
    log(`[DOM] data-testid="settings-max-tokens": ${!!hasMaxTokens}`);
    results.push({
      name: 'SETTINGS-16: Max Tokens input exists',
      passed: !!hasMaxTokens,
      reason: hasMaxTokens ? undefined : 'Missing max tokens input - API Keys only UI detected',
    });

    // Check 17: Full Settings UI - temperature input exists
    const hasTemperature = await page.$('[data-testid="settings-temperature"]');
    log(`[DOM] data-testid="settings-temperature": ${!!hasTemperature}`);
    results.push({
      name: 'SETTINGS-17: Temperature input exists',
      passed: !!hasTemperature,
      reason: hasTemperature ? undefined : 'Missing temperature input - API Keys only UI detected',
    });

    // Check 18: Full Settings UI - environment info exists
    const hasEnvInfo = await page.$('[data-testid="settings-envinfo"]');
    log(`[DOM] data-testid="settings-envinfo": ${!!hasEnvInfo}`);
    results.push({
      name: 'SETTINGS-18: Environment Info section exists',
      passed: !!hasEnvInfo,
      reason: hasEnvInfo ? undefined : 'Missing environment info - API Keys only UI detected',
    });

    // ========================================
    // AC-SCOPE-1: Global and Project DOM differ
    // ========================================
    log('[AC-SCOPE-1] Testing Global vs Project tab differentiation...');

    // Ensure we're on Global tab (default now)
    const globalTabBtn = await page.$('[data-testid="settings-tab-global"]');
    if (globalTabBtn) {
      await globalTabBtn.click();
      await page.waitForTimeout(300);
    }

    // Capture Global tab fingerprint
    const globalScope = await page.$eval('[data-testid="settings-root"]', el => el.getAttribute('data-scope'));
    const globalHasApiKeys = await page.$('[data-testid="settings-apikeys"]');
    const globalHasProjectOverrides = await page.$('[data-testid="settings-project-overrides"]');
    const globalHeadings = await page.$$eval('h3', els => els.map(e => e.textContent?.trim() || ''));

    log(`[AC-SCOPE-1] Global tab: scope=${globalScope}, hasApiKeys=${!!globalHasApiKeys}, hasProjectOverrides=${!!globalHasProjectOverrides}`);
    log(`[AC-SCOPE-1] Global headings: ${JSON.stringify(globalHeadings)}`);

    // Switch to Project tab
    const projectTabBtn = await page.$('[data-testid="settings-tab-project"]');
    if (projectTabBtn) {
      await projectTabBtn.click();
      await page.waitForTimeout(300);
    }

    // Capture Project tab fingerprint
    const projectScope = await page.$eval('[data-testid="settings-root"]', el => el.getAttribute('data-scope'));
    const projectHasApiKeys = await page.$('[data-testid="settings-apikeys"]');
    const projectHasProjectOverrides = await page.$('[data-testid="settings-project-overrides"]');
    const projectHeadings = await page.$$eval('h3', els => els.map(e => e.textContent?.trim() || ''));

    log(`[AC-SCOPE-1] Project tab: scope=${projectScope}, hasApiKeys=${!!projectHasApiKeys}, hasProjectOverrides=${!!projectHasProjectOverrides}`);
    log(`[AC-SCOPE-1] Project headings: ${JSON.stringify(projectHeadings)}`);

    // AC-SCOPE-1a: data-scope attribute differs
    const scopesDiffer = globalScope !== projectScope && globalScope === 'global' && projectScope === 'project';
    results.push({
      name: 'AC-SCOPE-1a: Global/Project have different data-scope',
      passed: scopesDiffer,
      reason: scopesDiffer ? undefined : `Scopes same or wrong: global=${globalScope}, project=${projectScope}`,
    });

    // AC-SCOPE-1b: API Keys section exists ONLY in Global
    const apiKeysOnlyInGlobal = !!globalHasApiKeys && !projectHasApiKeys;
    results.push({
      name: 'AC-SCOPE-1b: API Keys section exists ONLY in Global tab',
      passed: apiKeysOnlyInGlobal,
      reason: apiKeysOnlyInGlobal ? undefined : `Global hasApiKeys=${!!globalHasApiKeys}, Project hasApiKeys=${!!projectHasApiKeys}`,
    });

    // AC-SCOPE-1c: Project Overrides section exists ONLY in Project
    const projectOverridesOnlyInProject = !globalHasProjectOverrides && !!projectHasProjectOverrides;
    results.push({
      name: 'AC-SCOPE-1c: Project Overrides section exists ONLY in Project tab',
      passed: projectOverridesOnlyInProject,
      reason: projectOverridesOnlyInProject ? undefined : `Global hasOverrides=${!!globalHasProjectOverrides}, Project hasOverrides=${!!projectHasProjectOverrides}`,
    });

    // AC-SCOPE-1d: Heading lists differ
    const headingsAreSame = JSON.stringify(globalHeadings) === JSON.stringify(projectHeadings);
    results.push({
      name: 'AC-SCOPE-1d: Global and Project headings differ',
      passed: !headingsAreSame,
      reason: !headingsAreSame ? undefined : `Headings are identical: ${JSON.stringify(globalHeadings)}`,
    });

    // ========================================
    // AC-SCOPE-2: Network verification (save destinations)
    // ========================================
    log('[AC-SCOPE-2] Verifying save API destinations...');

    // Track network requests
    const capturedRequests: { url: string; method: string; body: string }[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/settings') && request.method() === 'PUT') {
        capturedRequests.push({
          url: request.url(),
          method: request.method(),
          body: request.postData() || '',
        });
      }
    });

    // Switch back to Global tab and save
    await page.$eval('[data-testid="settings-tab-global"]', (el) => (el as any).click());
    await page.waitForTimeout(300);

    // Find and click "Save Global Settings" button
    const globalSaveBtn = await page.$('button:has-text("Save Global Settings")');
    if (globalSaveBtn) {
      // Intercept alert
      page.on('dialog', dialog => dialog.accept());
      await globalSaveBtn.click();
      await page.waitForTimeout(500);
    }

    // Check global save went to /api/settings/project WITHOUT projectId
    const globalSaveReq = capturedRequests.find(r => r.url.includes('/api/settings/project') && !r.url.includes('projectId'));
    log(`[AC-SCOPE-2] Global save request: ${globalSaveReq ? globalSaveReq.url : 'NOT FOUND'}`);

    results.push({
      name: 'AC-SCOPE-2a: Global save uses /api/settings/project (no projectId)',
      passed: !!globalSaveReq,
      reason: globalSaveReq ? undefined : 'Global save request not captured or has projectId',
    });

    // Switch to Project tab and save
    capturedRequests.length = 0; // Clear
    await page.$eval('[data-testid="settings-tab-project"]', (el) => (el as any).click());
    await page.waitForTimeout(300);

    // Enable an override checkbox to have something to save
    const overrideCheckbox = await page.$('#override-provider');
    if (overrideCheckbox) {
      await overrideCheckbox.click();
      await page.waitForTimeout(100);
    }

    const projectSaveBtn = await page.$('button:has-text("Save Project Overrides")');
    if (projectSaveBtn) {
      await projectSaveBtn.click();
      await page.waitForTimeout(500);
    }

    // Check project save went to /api/settings/project WITH projectId
    const projectSaveReq = capturedRequests.find(r => r.url.includes('/api/settings/project') && r.url.includes('projectId'));
    log(`[AC-SCOPE-2] Project save request: ${projectSaveReq ? projectSaveReq.url : 'NOT FOUND'}`);

    results.push({
      name: 'AC-SCOPE-2b: Project save uses /api/settings/project?projectId=...',
      passed: !!projectSaveReq,
      reason: projectSaveReq ? undefined : 'Project save request not captured or missing projectId',
    });

    // ========================================
    // AC-SCOPE-3: E2E state isolation verified
    // ========================================
    log('[AC-SCOPE-3] Verifying E2E state isolation...');

    // Check that E2E stateDir was used (already verified above)
    const e2eApiKeysExists = fs.existsSync(path.join(E2E_STATE_DIR, 'api-keys.json'));
    results.push({
      name: 'AC-SCOPE-3a: E2E stateDir contains api-keys.json',
      passed: e2eApiKeysExists,
      reason: e2eApiKeysExists ? undefined : `E2E api-keys.json not found at ${E2E_STATE_DIR}`,
    });

    // Check real stateDir is NOT polluted
    const realStateDir = path.join(PROJECT_ROOT, '.claude', 'state');
    let realStatePolluted = false;
    if (fs.existsSync(realStateDir)) {
      const realNamespaces = fs.readdirSync(realStateDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('e2e-test-'))
        .map(d => d.name);

      for (const ns of realNamespaces) {
        const apiKeysFile = path.join(realStateDir, ns, 'api-keys.json');
        if (fs.existsSync(apiKeysFile)) {
          try {
            const content = fs.readFileSync(apiKeysFile, 'utf-8');
            if (content.includes('gate-test')) {
              realStatePolluted = true;
              log(`[AC-SCOPE-3] POLLUTION: Found gate-test in ${apiKeysFile}`);
            }
          } catch { /* ignore */ }
        }
      }
    }

    results.push({
      name: 'AC-SCOPE-3b: Real stateDir has no test key pollution',
      passed: !realStatePolluted,
      reason: !realStatePolluted ? undefined : 'Found gate-test keys in real stateDir',
    });

    // Cleanup
    await page.close();
    await context.close();
    await browser.close();
    browser = null;

  } catch (error) {
    results.push({
      name: 'SETTINGS-RUNTIME',
      passed: false,
      reason: `Runtime error: ${(error as Error).message}`,
    });
  } finally {
    // Cleanup server
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (browser) {
      await browser.close().catch(() => {});
    }

    // CRITICAL: Always clean up E2E state
    log('[CLEANUP] Cleaning up E2E stateDir...');
    cleanupE2eState();

    // Final check: verify no pollution in real state
    log('[VERIFY] Checking for state pollution after test...');
    checkAndCleanRealState();
  }

  // Print results
  console.log('');
  let allPassed = true;
  for (const r of results) {
    const status = r.passed ? '[PASS]' : '[FAIL]';
    const reason = r.reason ? `\n       Reason: ${r.reason}` : '';
    console.log(`${status} ${r.name}${reason}`);
    if (!r.passed) allPassed = false;
  }

  console.log('');
  console.log(`Overall: ${allPassed ? 'ALL PASS' : 'SOME FAILED'}`);
  console.log(`E2E stateDir used: ${E2E_STATE_DIR}`);
  console.log(`Log file: ${LOG_FILE}`);
  console.log('');

  if (!allPassed) {
    process.exit(1);
  }
}

runChecks().catch(err => {
  console.error('Fatal error:', err);
  // Ensure cleanup even on fatal error
  cleanupE2eState();
  process.exit(1);
});
