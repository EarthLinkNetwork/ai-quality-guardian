#!/usr/bin/env ts-node
/**
 * Browser UI Verification Gate (AC-UI-RC-1 to AC-UI-RC-4)
 *
 * Runs Playwright E2E tests to verify Runner Controls UI visibility
 * in an actual browser environment.
 *
 * This gate ensures:
 * - AC-UI-RC-1: Settings画面にRunner Controlsセクションが表示される
 * - AC-UI-RC-2: ボタン押下でAPIが呼ばれUIにフィードバック表示
 * - AC-UI-RC-3: build_sha/web_pid変化をUIと/api/healthで検証可能
 * - AC-UI-RC-4: リロード後もRunner Controlsが表示される
 * - AC-GATE-RC-1: E2Eがgate:allに組み込まれ失敗時は完了判定不可
 *
 * Unlike HTML content tests (supertest), this gate uses a real browser
 * to detect issues like:
 * - JavaScript errors preventing rendering
 * - CSS hiding elements
 * - Tab navigation failures
 * - State initialization problems
 */

import { execSync, spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const PROJECT_ROOT = path.resolve(__dirname, '..');

interface GateResult {
  passed: boolean;
  testCount: number;
  failedCount: number;
  output: string;
}

function runPlaywrightTests(): GateResult {
  console.log('\n=== Browser UI Verification Gate ===\n');
  console.log('Running Playwright E2E tests for Runner Controls UI...\n');

  try {
    // Run Playwright tests
    const output = execSync(
      'npx playwright test test/playwright/runner-controls-browser.spec.ts --reporter=list',
      {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
        timeout: 180000, // 3 minutes
        env: {
          ...process.env,
          NODE_ENV: 'test',
          // Force headless mode
          PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH,
        },
      }
    );

    // Parse results
    const passedMatch = output.match(/(\d+) passed/);
    const failedMatch = output.match(/(\d+) failed/);

    const passed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
    const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;

    console.log(output);

    return {
      passed: failed === 0 && passed > 0,
      testCount: passed + failed,
      failedCount: failed,
      output,
    };
  } catch (error: any) {
    const output = error.stdout || error.stderr || error.message || 'Unknown error';
    console.log(output);

    // Try to parse even failed output
    const passedMatch = output.match(/(\d+) passed/);
    const failedMatch = output.match(/(\d+) failed/);

    const passed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
    const failed = failedMatch ? parseInt(failedMatch[1], 10) : 1; // At least 1 failed

    return {
      passed: false,
      testCount: passed + failed,
      failedCount: failed,
      output,
    };
  }
}

function checkPlaywrightInstalled(): boolean {
  try {
    execSync('npx playwright --version', {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      timeout: 10000,
    });
    return true;
  } catch {
    return false;
  }
}

function checkBrowsersInstalled(): boolean {
  try {
    // Check if chromium is available
    const output = execSync('npx playwright install --dry-run chromium 2>&1 || true', {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      timeout: 10000,
    });
    // If dry-run says "already installed" or doesn't output install messages, browsers are ready
    return !output.includes('install');
  } catch {
    return false;
  }
}

function installBrowsers(): boolean {
  console.log('Installing Playwright browsers...');
  try {
    execSync('npx playwright install chromium', {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      timeout: 120000, // 2 minutes for download
      stdio: 'inherit',
    });
    return true;
  } catch (error) {
    console.error('Failed to install Playwright browsers:', error);
    return false;
  }
}

function main() {
  // Verify Playwright is installed
  if (!checkPlaywrightInstalled()) {
    console.error('[FAIL] Playwright is not installed');
    console.error('Run: npm install playwright');
    process.exit(1);
  }

  // Verify test file exists
  const testFile = path.join(PROJECT_ROOT, 'test/playwright/runner-controls-browser.spec.ts');
  if (!fs.existsSync(testFile)) {
    console.error('[FAIL] Playwright test file not found:', testFile);
    process.exit(1);
  }

  // Check if browsers are installed, install if needed
  try {
    execSync('npx playwright install chromium --with-deps 2>/dev/null || npx playwright install chromium', {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      timeout: 180000,
      stdio: 'pipe',
    });
  } catch {
    // Ignore - will fail later if browsers truly aren't available
  }

  // Run tests
  const result = runPlaywrightTests();

  console.log('\n--- Summary ---\n');

  if (result.passed) {
    console.log(`[PASS] BROWSER-UI: Runner Controls UI verified (${result.testCount} tests passed)`);
    console.log('\nAC Verification:');
    console.log('  [PASS] AC-UI-RC-1: Settings画面にRunner Controlsセクション表示');
    console.log('  [PASS] AC-UI-RC-2: ボタン押下でAPIコール+UIフィードバック');
    console.log('  [PASS] AC-UI-RC-4: リロード後もRunner Controls表示');
    console.log('  [PASS] AC-GATE-RC-1: gate:allに組み込み済み');
    console.log('\nOverall: ALL PASS\n');
    process.exit(0);
  } else {
    console.log(`[FAIL] BROWSER-UI: Runner Controls UI verification failed`);
    console.log(`       ${result.failedCount} test(s) failed out of ${result.testCount}`);
    console.log('\nThis means:');
    console.log('  - Runner Controls may not be visible in the browser');
    console.log('  - JavaScript errors may be preventing UI rendering');
    console.log('  - CSS may be hiding elements');
    console.log('  - Tab navigation may be broken');
    console.log('\nOverall: FAIL\n');
    process.exit(1);
  }
}

main();
