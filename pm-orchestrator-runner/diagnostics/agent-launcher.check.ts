/**
 * Agent Launcher E2E Diagnostic Check
 *
 * Verifies:
 * A) Web UI で指定したフォルダーが effective cwd になること
 * B) namespace/stateDir が明示され、フォルダーを変えると混線しないこと
 * C) Agent 機能がロードされることを確認
 * D) Playwright で回帰検出
 */

import { chromium, Browser, Page } from 'playwright';
import { spawn, ChildProcess, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const PORT = 5703;
const BASE_URL = `http://localhost:${PORT}`;
const LOG_FILE = path.join(__dirname, '..', '.tmp', 'gate-agent-launcher.log');

// Test results
const results: { name: string; passed: boolean; detail?: string }[] = [];

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function pass(name: string, detail?: string) {
  results.push({ name, passed: true, detail });
  console.log(`[PASS] ${name}${detail ? ': ' + detail : ''}`);
}

function fail(name: string, detail?: string) {
  results.push({ name, passed: false, detail });
  console.log(`[FAIL] ${name}${detail ? ': ' + detail : ''}`);
}

// Derive namespace (same logic as server.ts)
function deriveNamespace(folderPath: string): string {
  const basename = path.basename(folderPath);
  const hash = crypto.createHash('sha256').update(folderPath).digest('hex').substring(0, 4);
  return `${basename}-${hash}`;
}

async function main() {
  console.log('\n=== Agent Launcher Diagnostic Check (Playwright) ===\n');

  // Ensure .tmp directory exists
  const tmpDir = path.join(__dirname, '..', '.tmp');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  // Clear log file
  fs.writeFileSync(LOG_FILE, '');

  // Create E2E isolated state directory
  const runId = crypto.randomBytes(4).toString('hex');
  const e2eStateDir = path.join(tmpDir, 'e2e-state', `run-${runId}`);
  fs.mkdirSync(e2eStateDir, { recursive: true });
  log(`[E2E] Created isolated stateDir: ${e2eStateDir}`);

  // Create two test project folders (projA and projB)
  const projA = path.join(tmpDir, 'e2e-agent-test', 'projA');
  const projB = path.join(tmpDir, 'e2e-agent-test', 'projB');

  // Clean up previous test folders
  const testRoot = path.join(tmpDir, 'e2e-agent-test');
  if (fs.existsSync(testRoot)) {
    fs.rmSync(testRoot, { recursive: true });
  }

  // Create projA with agents
  fs.mkdirSync(path.join(projA, '.claude', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(projA, '.claude', 'agents', 'test-agent-a.md'), `# Test Agent A
This is a test agent for projA.
`);
  fs.writeFileSync(path.join(projA, '.claude', 'CLAUDE.md'), '# Project A\n');
  log(`[E2E] Created projA at: ${projA}`);

  // Create projB with different agents
  fs.mkdirSync(path.join(projB, '.claude', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(projB, '.claude', 'agents', 'test-agent-b1.md'), `# Test Agent B1
This is a test agent for projB.
`);
  fs.writeFileSync(path.join(projB, '.claude', 'agents', 'test-agent-b2.md'), `# Test Agent B2
Another agent for projB.
`);
  fs.writeFileSync(path.join(projB, '.claude', 'CLAUDE.md'), '# Project B\n');
  log(`[E2E] Created projB at: ${projB}`);

  // Expected namespaces
  const expectedNamespaceA = deriveNamespace(projA);
  const expectedNamespaceB = deriveNamespace(projB);
  log(`[E2E] Expected namespace for projA: ${expectedNamespaceA}`);
  log(`[E2E] Expected namespace for projB: ${expectedNamespaceB}`);

  // Build first
  log('Building...');
  try {
    execSync('npm run build', { cwd: path.join(__dirname, '..'), stdio: 'pipe' });
  } catch (err) {
    console.error('Build failed:', err);
    process.exit(1);
  }

  // Start server with E2E isolation
  log('Starting server with E2E isolation...');
  const serverProcess: ChildProcess = spawn('node', ['dist/cli/index.js', 'web', '--port', PORT.toString()], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      PM_E2E_STATE_DIR: e2eStateDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverReady = false;
  const serverOutput: string[] = [];

  serverProcess.stdout?.on('data', (data) => {
    const line = data.toString();
    serverOutput.push(line);
    if (line.includes('Web UI server') || line.includes('Runner')) {
      log(`[SERVER] ${line.trim()}`);
    }
    if (line.includes('Press Ctrl+C') || line.includes('Queue poller')) {
      serverReady = true;
    }
  });

  serverProcess.stderr?.on('data', (data) => {
    serverOutput.push(data.toString());
  });

  // Wait for server to be ready
  const maxWait = 10000;
  const startTime = Date.now();
  while (!serverReady && Date.now() - startTime < maxWait) {
    await new Promise(r => setTimeout(r, 100));
  }

  if (!serverReady) {
    console.error('Server did not start in time');
    serverProcess.kill();
    process.exit(1);
  }

  log('Server ready');

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    // Launch browser
    log('Launching browser...');
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();

    // Collect console logs
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(text);
      if (text.includes('[AGENT-INSPECT]')) {
        log(`[BROWSER] ${text}`);
      }
    });

    // Navigate to /agent
    log('Navigating to /agent...');
    const response = await page.goto(`${BASE_URL}/agent`);
    log(`Page status: ${response?.status()}`);

    // AC-AGENT-1: Agent Launcher page loads
    if (response?.status() === 200) {
      pass('AC-AGENT-1', '/agent returns 200');
    } else {
      fail('AC-AGENT-1', `/agent returned ${response?.status()}`);
    }

    // AC-AGENT-2: Agent Launcher root exists
    const launcherRoot = await page.$('[data-testid="agent-launcher-root"]');
    if (launcherRoot) {
      pass('AC-AGENT-2', 'Agent Launcher root element exists');
    } else {
      fail('AC-AGENT-2', 'Agent Launcher root element not found');
    }

    // AC-AGENT-3: Folder input exists
    const folderInput = await page.$('[data-testid="folder-input"]');
    if (folderInput) {
      pass('AC-AGENT-3', 'Folder input exists');
    } else {
      fail('AC-AGENT-3', 'Folder input not found');
    }

    // Test projA
    log('[AC-AGENT-4] Testing projA inspection...');
    await page.fill('[data-testid="folder-input"]', projA);
    await page.click('button:has-text("Inspect")');
    await page.waitForSelector('[data-testid="agent-info-card"]', { timeout: 5000 });

    // Verify projA results
    const projAEffectiveCwd = await page.$eval('[data-testid="effective-cwd"]', el => el.textContent);
    const projANamespace = await page.$eval('[data-testid="namespace"]', el => el.textContent);
    const projAStateDir = await page.$eval('[data-testid="state-dir"]', el => el.textContent);
    const projAAgentCount = await page.$eval('[data-testid="agent-count"]', el => el.textContent);

    log(`[AC-AGENT-4] projA effective-cwd: ${projAEffectiveCwd}`);
    log(`[AC-AGENT-4] projA namespace: ${projANamespace}`);
    log(`[AC-AGENT-4] projA state-dir: ${projAStateDir}`);
    log(`[AC-AGENT-4] projA agent-count: ${projAAgentCount}`);

    // AC-AGENT-4a: effectiveCwd matches projA
    if (projAEffectiveCwd === projA) {
      pass('AC-AGENT-4a', `projA effectiveCwd correct: ${projA}`);
    } else {
      fail('AC-AGENT-4a', `projA effectiveCwd mismatch: expected ${projA}, got ${projAEffectiveCwd}`);
    }

    // AC-AGENT-4b: namespace derived correctly for projA
    if (projANamespace === expectedNamespaceA) {
      pass('AC-AGENT-4b', `projA namespace correct: ${expectedNamespaceA}`);
    } else {
      fail('AC-AGENT-4b', `projA namespace mismatch: expected ${expectedNamespaceA}, got ${projANamespace}`);
    }

    // AC-AGENT-4c: agent count is 1 for projA
    if (projAAgentCount === '1') {
      pass('AC-AGENT-4c', 'projA has 1 agent');
    } else {
      fail('AC-AGENT-4c', `projA agent count mismatch: expected 1, got ${projAAgentCount}`);
    }

    // Test projB
    log('[AC-AGENT-5] Testing projB inspection...');
    await page.fill('[data-testid="folder-input"]', projB);
    await page.click('button:has-text("Inspect")');
    await page.waitForTimeout(500);

    const projBEffectiveCwd = await page.$eval('[data-testid="effective-cwd"]', el => el.textContent);
    const projBNamespace = await page.$eval('[data-testid="namespace"]', el => el.textContent);
    const projBStateDir = await page.$eval('[data-testid="state-dir"]', el => el.textContent);
    const projBAgentCount = await page.$eval('[data-testid="agent-count"]', el => el.textContent);

    log(`[AC-AGENT-5] projB effective-cwd: ${projBEffectiveCwd}`);
    log(`[AC-AGENT-5] projB namespace: ${projBNamespace}`);
    log(`[AC-AGENT-5] projB state-dir: ${projBStateDir}`);
    log(`[AC-AGENT-5] projB agent-count: ${projBAgentCount}`);

    // AC-AGENT-5a: effectiveCwd matches projB
    if (projBEffectiveCwd === projB) {
      pass('AC-AGENT-5a', `projB effectiveCwd correct: ${projB}`);
    } else {
      fail('AC-AGENT-5a', `projB effectiveCwd mismatch: expected ${projB}, got ${projBEffectiveCwd}`);
    }

    // AC-AGENT-5b: namespace derived correctly for projB
    if (projBNamespace === expectedNamespaceB) {
      pass('AC-AGENT-5b', `projB namespace correct: ${expectedNamespaceB}`);
    } else {
      fail('AC-AGENT-5b', `projB namespace mismatch: expected ${expectedNamespaceB}, got ${projBNamespace}`);
    }

    // AC-AGENT-5c: agent count is 2 for projB
    if (projBAgentCount === '2') {
      pass('AC-AGENT-5c', 'projB has 2 agents');
    } else {
      fail('AC-AGENT-5c', `projB agent count mismatch: expected 2, got ${projBAgentCount}`);
    }

    // AC-AGENT-6: namespace/stateDir do NOT mix between projA and projB
    if (projANamespace !== projBNamespace) {
      pass('AC-AGENT-6a', 'projA and projB have different namespaces (no mixing)');
    } else {
      fail('AC-AGENT-6a', `Namespace collision! Both have: ${projANamespace}`);
    }

    if (projAStateDir !== projBStateDir) {
      pass('AC-AGENT-6b', 'projA and projB have different stateDirs (no mixing)');
    } else {
      fail('AC-AGENT-6b', `StateDir collision! Both have: ${projAStateDir}`);
    }

    // AC-AGENT-7: Verify console logs contain AGENT-INSPECT data
    const agentInspectLogs = consoleLogs.filter(l => l.includes('[AGENT-INSPECT]'));
    if (agentInspectLogs.length >= 2) {
      pass('AC-AGENT-7', `Console has ${agentInspectLogs.length} AGENT-INSPECT logs`);
    } else {
      fail('AC-AGENT-7', `Expected 2+ AGENT-INSPECT logs, got ${agentInspectLogs.length}`);
    }

    // Save agent data to JSON for evidence
    const evidenceDir = path.join(tmpDir, 'agent-evidence');
    if (!fs.existsSync(evidenceDir)) {
      fs.mkdirSync(evidenceDir, { recursive: true });
    }

    // Parse and save the last inspect result
    if (agentInspectLogs.length > 0) {
      for (let i = 0; i < agentInspectLogs.length; i++) {
        const logLine = agentInspectLogs[i];
        const jsonStart = logLine.indexOf('{');
        if (jsonStart !== -1) {
          const jsonStr = logLine.substring(jsonStart);
          try {
            const data = JSON.parse(jsonStr);
            const fileName = `agent-inspect-${i + 1}.json`;
            fs.writeFileSync(path.join(evidenceDir, fileName), JSON.stringify(data, null, 2));
            log(`[EVIDENCE] Saved ${fileName}`);
          } catch (e) {
            log(`[EVIDENCE] Failed to parse JSON from log: ${e}`);
          }
        }
      }
    }

    // Take screenshot for evidence
    const screenshotPath = path.join(evidenceDir, 'agent-launcher-projB.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    log(`[EVIDENCE] Screenshot saved: ${screenshotPath}`);

    // AC-AGENT-8: Nav link exists
    const navLink = await page.$('nav a[data-nav="agent"]');
    if (navLink) {
      pass('AC-AGENT-8', 'Agent Launcher nav link exists');
    } else {
      fail('AC-AGENT-8', 'Agent Launcher nav link not found');
    }

  } catch (error) {
    console.error('Test error:', error);
    fail('TEST_ERROR', String(error));
  } finally {
    // Cleanup
    if (page) await page.close();
    if (browser) await browser.close();

    log('[SERVER] Shutting down...');
    serverProcess.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 1000));
    log('[SERVER] Shutdown complete');

    // Cleanup E2E state
    log('[CLEANUP] Cleaning up E2E stateDir...');
    if (fs.existsSync(e2eStateDir)) {
      fs.rmSync(e2eStateDir, { recursive: true });
      log(`[CLEANUP] Removed E2E stateDir: ${e2eStateDir}`);
    }

    // Keep test folders for evidence (they will be cleaned on next run)
  }

  // Print summary
  console.log('');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  results.forEach(r => {
    if (r.passed) {
      console.log(`[PASS] ${r.name}${r.detail ? ': ' + r.detail : ''}`);
    } else {
      console.log(`[FAIL] ${r.name}${r.detail ? ': ' + r.detail : ''}`);
    }
  });

  console.log('');
  if (failed === 0) {
    console.log(`Overall: ALL PASS (${passed}/${results.length} checks)`);
    console.log(`Evidence directory: ${path.join(tmpDir, 'agent-evidence')}`);
    console.log(`Log file: ${LOG_FILE}`);
  } else {
    console.log(`Overall: ${failed} FAILED (${passed}/${results.length} checks passed)`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
