/**
 * Web UI Boot Fail-Closed Diagnostic Check
 *
 * Verifies AC-UI-1 to AC-UI-5 structural requirements:
 *   - AC-UI-1/2: window.__PM_BOOT_STATUS__ in index.html
 *   - AC-UI-2: PM_WEB_TEST_MODE support in server.ts
 *   - AC-UI-3: Playwright integration test exists
 *
 * Run: npx ts-node diagnostics/web-boot.check.ts
 *
 * Exit codes:
 *   0 = all checks pass
 *   1 = one or more checks fail
 */

import * as fs from 'fs';
import * as path from 'path';

interface CheckResult {
  rule: string;
  description: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  reason?: string;
}

const results: CheckResult[] = [];

function check(rule: string, description: string, fn: () => boolean | string): void {
  try {
    const result = fn();
    if (result === true) {
      results.push({ rule, description, status: 'PASS' });
    } else {
      results.push({ rule, description, status: 'FAIL', reason: typeof result === 'string' ? result : 'Check returned false' });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ rule, description, status: 'FAIL', reason: msg });
  }
}

const PROJECT_ROOT = path.resolve(__dirname, '..');

// -------------------------------------------------------------------
// AC-UI-1/2: window.__PM_BOOT_STATUS__ exists in index.html
// -------------------------------------------------------------------
check('AC-UI-1', 'window.__PM_BOOT_STATUS__ defined in index.html', () => {
  const indexPath = path.join(PROJECT_ROOT, 'src/web/public/index.html');
  if (!fs.existsSync(indexPath)) return 'src/web/public/index.html not found';

  const src = fs.readFileSync(indexPath, 'utf-8');
  if (!src.includes('window.__PM_BOOT_STATUS__')) {
    return 'window.__PM_BOOT_STATUS__ not found in index.html';
  }
  if (!src.includes('setBootPhase')) {
    return 'setBootPhase function not found in index.html';
  }
  return true;
});

// -------------------------------------------------------------------
// AC-UI-1: Boot phases defined (init, namespaces, router, ready, failed)
// -------------------------------------------------------------------
check('AC-UI-1b', 'Boot phases include ready and failed states', () => {
  const indexPath = path.join(PROJECT_ROOT, 'src/web/public/index.html');
  const src = fs.readFileSync(indexPath, 'utf-8');

  const requiredPhases = ['init', 'namespaces', 'router', 'ready', 'failed'];
  for (const phase of requiredPhases) {
    if (!src.includes(`'${phase}'`)) {
      return `Boot phase '${phase}' not found in setBootPhase calls`;
    }
  }
  return true;
});

// -------------------------------------------------------------------
// AC-UI-2: PM_WEB_TEST_MODE support in server.ts
// -------------------------------------------------------------------
check('AC-UI-2', 'PM_WEB_TEST_MODE support in server.ts', () => {
  const serverPath = path.join(PROJECT_ROOT, 'src/web/server.ts');
  if (!fs.existsSync(serverPath)) return 'src/web/server.ts not found';

  const src = fs.readFileSync(serverPath, 'utf-8');
  if (!src.includes('PM_WEB_TEST_MODE')) {
    return 'PM_WEB_TEST_MODE not found in server.ts';
  }
  if (!src.includes('fail_namespaces')) {
    return 'fail_namespaces test mode not found in server.ts';
  }
  return true;
});

// -------------------------------------------------------------------
// AC-UI-2b: showBootError function exists for fail-closed display
// -------------------------------------------------------------------
check('AC-UI-2b', 'showBootError function exists for fail-closed display', () => {
  const indexPath = path.join(PROJECT_ROOT, 'src/web/public/index.html');
  const src = fs.readFileSync(indexPath, 'utf-8');

  if (!src.includes('function showBootError')) {
    return 'showBootError function not found in index.html';
  }
  if (!src.includes('Retry')) {
    return 'Retry button not found in boot error display';
  }
  return true;
});

// -------------------------------------------------------------------
// AC-UI-3: Playwright integration test file exists
// -------------------------------------------------------------------
check('AC-UI-3', 'Playwright integration test file exists', () => {
  const testPath = path.join(PROJECT_ROOT, 'test/integration/web-boot-failclosed.test.ts');
  if (!fs.existsSync(testPath)) return 'test/integration/web-boot-failclosed.test.ts not found';

  const src = fs.readFileSync(testPath, 'utf-8');
  if (!src.includes('playwright')) {
    return 'playwright import not found in test file';
  }
  if (!src.includes('AC-UI-1')) {
    return 'AC-UI-1 test case not found';
  }
  if (!src.includes('AC-UI-2')) {
    return 'AC-UI-2 test case not found';
  }
  return true;
});

// -------------------------------------------------------------------
// AC-UI-3b: Integration test has both success and fail-closed tests
// -------------------------------------------------------------------
check('AC-UI-3b', 'Integration test covers both success and fail-closed cases', () => {
  const testPath = path.join(PROJECT_ROOT, 'test/integration/web-boot-failclosed.test.ts');
  const src = fs.readFileSync(testPath, 'utf-8');

  if (!src.includes('Normal Boot Success')) {
    return 'Normal boot success test case not found';
  }
  if (!src.includes('Fail-Closed')) {
    return 'Fail-closed test case not found';
  }
  if (!src.includes('waitForBootStatus')) {
    return 'Boot status verification not found';
  }
  return true;
});

// -------------------------------------------------------------------
// Print results
// -------------------------------------------------------------------
console.log('\n=== Web UI Boot Fail-Closed Diagnostic Check ===\n');

let allPass = true;
for (const r of results) {
  const icon = r.status === 'PASS' ? '[PASS]' : r.status === 'FAIL' ? '[FAIL]' : '[SKIP]';
  console.log(`${icon} ${r.rule}: ${r.description}`);
  if (r.reason) {
    console.log(`       Reason: ${r.reason}`);
  }
  if (r.status === 'FAIL') allPass = false;
}

console.log(`\nOverall: ${allPass ? 'ALL PASS' : 'SOME FAILURES'}`);
process.exit(allPass ? 0 : 1);
