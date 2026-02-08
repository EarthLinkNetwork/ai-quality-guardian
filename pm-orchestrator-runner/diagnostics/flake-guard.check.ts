#!/usr/bin/env ts-node
/**
 * Flake Guard Gate
 *
 * Runs flaky-prone E2E tests multiple times to ensure stability.
 * A test must pass N consecutive times to be considered stable.
 *
 * Purpose: Prevent "passes on retry" from being marked as fixed.
 * Any failure in N runs = GATE FAIL
 */

import { execSync } from 'child_process';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Tests that have shown flakiness in the past
const FLAKY_PRONE_TESTS = [
  'persist chat-created Task Groups',  // ECONNRESET on app recreation
  'Real Restart Verification',         // PID/process timing
];

const REQUIRED_CONSECUTIVE_PASSES = 10;

interface TestResult {
  testPattern: string;
  runs: number;
  passes: number;
  failures: number;
  stable: boolean;
  failureDetails: string[];
}

function runTest(pattern: string): { success: boolean; output: string } {
  try {
    const output = execSync(
      `npx mocha --require ts-node/register "test/**/*.test.ts" --grep "${pattern}" 2>&1`,
      {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
        timeout: 120000,
        env: { ...process.env, NODE_ENV: 'test' },
      }
    );
    return { success: true, output };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return {
      success: false,
      output: err.stdout || err.stderr || err.message || 'Unknown error',
    };
  }
}

function runFlakeGuard(pattern: string): TestResult {
  const result: TestResult = {
    testPattern: pattern,
    runs: REQUIRED_CONSECUTIVE_PASSES,
    passes: 0,
    failures: 0,
    stable: true,
    failureDetails: [],
  };

  console.log(`  Testing: "${pattern}"`);
  console.log(`  Required consecutive passes: ${REQUIRED_CONSECUTIVE_PASSES}`);
  process.stdout.write('  Progress: ');

  for (let i = 0; i < REQUIRED_CONSECUTIVE_PASSES; i++) {
    const { success, output } = runTest(pattern);

    if (success) {
      result.passes++;
      process.stdout.write('.');
    } else {
      result.failures++;
      result.stable = false;
      result.failureDetails.push(`Run ${i + 1}: ${output.slice(0, 500)}`);
      process.stdout.write('X');
      // Stop early on failure - no point continuing
      break;
    }
  }

  console.log('');
  return result;
}

function main() {
  console.log('\n=== Flake Guard Gate ===\n');
  console.log(`Running ${FLAKY_PRONE_TESTS.length} flaky-prone test patterns`);
  console.log(`Each must pass ${REQUIRED_CONSECUTIVE_PASSES} consecutive times\n`);

  const results: TestResult[] = [];
  let allStable = true;

  for (const pattern of FLAKY_PRONE_TESTS) {
    const result = runFlakeGuard(pattern);
    results.push(result);

    if (!result.stable) {
      allStable = false;
    }

    console.log(`  Result: ${result.stable ? '[STABLE]' : '[FLAKY]'} (${result.passes}/${result.runs} passed)\n`);
  }

  console.log('--- Summary ---\n');

  for (const result of results) {
    const status = result.stable ? '[PASS]' : '[FAIL]';
    console.log(`${status} FLAKE-GUARD: "${result.testPattern}" (${result.passes}/${result.runs})`);

    if (!result.stable && result.failureDetails.length > 0) {
      console.log('  Failure details:');
      for (const detail of result.failureDetails) {
        console.log(`    ${detail.substring(0, 200)}...`);
      }
    }
  }

  console.log('');

  const stableCount = results.filter(r => r.stable).length;
  console.log(`Stable Tests: ${stableCount}/${results.length}`);

  if (allStable) {
    console.log('\nOverall: ALL PASS\n');
    process.exit(0);
  } else {
    console.log('\nOverall: FAIL (flaky tests detected)\n');
    process.exit(1);
  }
}

main();
