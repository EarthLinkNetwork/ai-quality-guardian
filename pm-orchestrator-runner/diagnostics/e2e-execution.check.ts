#!/usr/bin/env ts-node
/**
 * E2E Execution Verification Gate
 *
 * Ensures that critical E2E tests actually execute and pass.
 * Prevents "tests not running but reported as ALL PASS" scenarios.
 *
 * Required E2E tests:
 * - e2e-restart-resume.e2e.test.ts
 * - e2e-supervisor-template.e2e.test.ts
 * - e2e-output-format.e2e.test.ts
 * - e2e-no-user-debug.e2e.test.ts
 * - e2e-web-self-dev.e2e.test.ts
 * - e2e-real-restart.e2e.test.ts (WEB_COMPLETE_OPERATION)
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

interface TestResult {
  file: string;
  ran: boolean;
  passed: boolean;
  testCount: number;
  output: string;
}

const REQUIRED_E2E_TESTS = [
  'test/e2e/e2e-restart-resume.e2e.test.ts',
  'test/e2e/e2e-supervisor-template.e2e.test.ts',
  'test/e2e/e2e-output-format.e2e.test.ts',
  'test/e2e/e2e-no-user-debug.e2e.test.ts',
  'test/e2e/e2e-web-self-dev.e2e.test.ts',
  'test/e2e/e2e-real-restart.e2e.test.ts',
];

const REQUIRED_DESCRIBE_PATTERNS = [
  'E2E: Restart and Resume Scenarios',
  'E2E: Supervisor Template System',
  'E2E: Output Format Enforcement',
  'E2E: No User Manual Debug Required',
  'E2E: Web UI Self-Development Capability',
  'E2E: Real Restart Verification (WEB_COMPLETE_OPERATION)',
];

function runTest(testFile: string): TestResult {
  const fullPath = path.join(PROJECT_ROOT, testFile);

  if (!fs.existsSync(fullPath)) {
    return {
      file: testFile,
      ran: false,
      passed: false,
      testCount: 0,
      output: `File not found: ${fullPath}`,
    };
  }

  try {
    const output = execSync(
      `npx mocha --require ts-node/register "${fullPath}" 2>&1`,
      {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
        timeout: 60000,
        env: { ...process.env, NODE_ENV: 'test' },
      }
    );

    // Parse output for passing count
    const passingMatch = output.match(/(\d+)\s+passing/);
    const failingMatch = output.match(/(\d+)\s+failing/);

    const passing = passingMatch ? parseInt(passingMatch[1], 10) : 0;
    const failing = failingMatch ? parseInt(failingMatch[1], 10) : 0;

    return {
      file: testFile,
      ran: true,
      passed: failing === 0 && passing > 0,
      testCount: passing,
      output: output,
    };
  } catch (error: any) {
    return {
      file: testFile,
      ran: true,
      passed: false,
      testCount: 0,
      output: error.stdout || error.message || 'Unknown error',
    };
  }
}

function verifyDescribeInOutput(output: string, pattern: string): boolean {
  return output.includes(pattern);
}

function main() {
  console.log('\n=== E2E Execution Verification Gate ===\n');

  const results: TestResult[] = [];
  let allPassed = true;

  for (const testFile of REQUIRED_E2E_TESTS) {
    console.log(`Running: ${testFile}...`);
    const result = runTest(testFile);
    results.push(result);

    if (!result.ran) {
      console.log(`  [FAIL] Test did not run: ${result.output}`);
      allPassed = false;
    } else if (!result.passed) {
      console.log(`  [FAIL] Test failed`);
      allPassed = false;
    } else {
      console.log(`  [PASS] ${result.testCount} tests passed`);
    }
  }

  console.log('\n--- Summary ---\n');

  // Verify all required describe blocks were executed
  const allOutput = results.map(r => r.output).join('\n');

  for (const pattern of REQUIRED_DESCRIBE_PATTERNS) {
    const found = verifyDescribeInOutput(allOutput, pattern);
    if (found) {
      console.log(`[PASS] E2E-EXEC-${REQUIRED_DESCRIBE_PATTERNS.indexOf(pattern) + 1}: "${pattern}" executed`);
    } else {
      console.log(`[FAIL] E2E-EXEC-${REQUIRED_DESCRIBE_PATTERNS.indexOf(pattern) + 1}: "${pattern}" NOT executed`);
      allPassed = false;
    }
  }

  console.log('');

  // Final summary
  const passedCount = results.filter(r => r.passed).length;
  const totalTests = results.reduce((sum, r) => sum + r.testCount, 0);

  console.log(`E2E Files: ${passedCount}/${results.length} passed`);
  console.log(`Total Tests: ${totalTests} executed`);

  if (allPassed) {
    console.log('\nOverall: ALL PASS\n');
    process.exit(0);
  } else {
    console.log('\nOverall: FAIL\n');
    process.exit(1);
  }
}

main();
