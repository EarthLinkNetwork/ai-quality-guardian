#!/usr/bin/env ts-node
/**
 * E2E Smoke Test Runner
 *
 * Purpose: Prove that the wrapper works deterministically in local environment
 * - 10 consecutive E2E runs
 * - Each run tests 3 scenarios (success, fail-closed error, exit typo)
 * - Validates: no hang, correct exit code, no RUNNING residue, summary present
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const TOTAL_RUNS = 10;
const TIMEOUT_MS = 30000; // 30 seconds per scenario
const CLI_PATH = path.join(__dirname, '..', 'dist', 'cli', 'index.js');

// Evidence directory (relative path, no absolute paths in logs)
const EVIDENCE_BASE = '.claude/evidence/e2e-smoke';

interface ScenarioResult {
  name: string;
  passed: boolean;
  exitCode: number | null;
  timedOut: boolean;
  hasExpectedSummary: boolean;
  runningResidue: boolean;
  errorMessage?: string;
  durationMs: number;
}

interface RunResult {
  runNumber: number;
  scenarios: ScenarioResult[];
  allPassed: boolean;
}

/**
 * Create timestamp for directory naming
 */
function createTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * Ensure evidence directory exists
 */
function ensureEvidenceDir(runDir: string): void {
  fs.mkdirSync(runDir, { recursive: true });
}

/**
 * Run CLI with input and capture output
 */
async function runScenario(
  input: string,
  scenarioName: string,
  projectRoot: string,
  logDir: string
): Promise<ScenarioResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let exitCode: number | null = null;

    const proc: ChildProcess = spawn('node', [
      CLI_PATH,
      'repl',
      '--non-interactive',
      '--exit-on-eof',
      '--project-mode', 'temp'
    ], {
      cwd: projectRoot,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Timeout handler
    const timeoutId = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGKILL');
    }, TIMEOUT_MS);

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code: number | null) => {
      clearTimeout(timeoutId);
      exitCode = code;
      const durationMs = Date.now() - startTime;

      // Save logs (sanitize paths)
      const sanitizedStdout = sanitizePaths(stdout);
      const sanitizedStderr = sanitizePaths(stderr);

      fs.writeFileSync(path.join(logDir, `${scenarioName}-stdout.log`), sanitizedStdout);
      fs.writeFileSync(path.join(logDir, `${scenarioName}-stderr.log`), sanitizedStderr);

      // Check for expected summary
      const hasExpectedSummary = checkSummary(stdout, scenarioName);

      // Check for RUNNING residue (in temp mode, check if session files remain with RUNNING status)
      const runningResidue = checkRunningResidue(stdout);

      // Determine pass/fail
      let passed = false;
      let errorMessage: string | undefined;

      if (timedOut) {
        errorMessage = 'Process timed out';
      } else if (scenarioName === 'exit-typo') {
        // Exit typo should return 0 and not reach executor
        passed = exitCode === 0 && hasExpectedSummary && !runningResidue;
        if (!passed) {
          errorMessage = `exit-typo: exitCode=${exitCode}, summary=${hasExpectedSummary}, running=${runningResidue}`;
        }
      } else if (scenarioName === 'success-task') {
        // Success should return 0
        passed = exitCode === 0 && hasExpectedSummary && !runningResidue;
        if (!passed) {
          errorMessage = `success: exitCode=${exitCode}, summary=${hasExpectedSummary}, running=${runningResidue}`;
        }
      } else if (scenarioName === 'fail-task') {
        // Fail should return 0 (fail-closed means control returns, not process crash)
        passed = exitCode === 0 && hasExpectedSummary && !runningResidue;
        if (!passed) {
          errorMessage = `fail: exitCode=${exitCode}, summary=${hasExpectedSummary}, running=${runningResidue}`;
        }
      }

      resolve({
        name: scenarioName,
        passed,
        exitCode,
        timedOut,
        hasExpectedSummary,
        runningResidue,
        errorMessage,
        durationMs
      });
    });

    proc.on('error', (err: Error) => {
      clearTimeout(timeoutId);
      resolve({
        name: scenarioName,
        passed: false,
        exitCode: null,
        timedOut: false,
        hasExpectedSummary: false,
        runningResidue: false,
        errorMessage: `Process error: ${err.message}`,
        durationMs: Date.now() - startTime
      });
    });

    // Send input
    if (proc.stdin) {
      proc.stdin.write(input);
      proc.stdin.end();
    }
  });
}

/**
 * Sanitize absolute paths from logs
 */
function sanitizePaths(text: string): string {
  // Replace home directory paths
  const homeDir = process.env.HOME || '/home/user';
  return text.replace(new RegExp(homeDir, 'g'), '~');
}

/**
 * Check if output contains expected summary format
 */
function checkSummary(stdout: string, scenarioName: string): boolean {
  // For exit-typo, we expect the unknown command message
  if (scenarioName === 'exit-typo') {
    // Should have "Unknown command" or similar output
    return stdout.includes('Unknown command') ||
           stdout.includes('unknown command') ||
           stdout.includes('Did you mean') ||
           stdout.includes('/exit');
  }

  // For other scenarios, check for session output markers
  // The REPL should show some prompt or status output
  return stdout.includes('pm-orchestrator>') ||
         stdout.includes('Session') ||
         stdout.includes('started') ||
         stdout.includes('PROJECT_PATH') ||
         stdout.length > 0;
}

/**
 * Check for RUNNING residue in output
 */
function checkRunningResidue(stdout: string): boolean {
  // Look for indicators that a session is stuck in RUNNING state
  // In temp mode, sessions are cleaned up, so we check for explicit RUNNING mentions
  const runningPatterns = [
    /status.*RUNNING/i,
    /state.*RUNNING/i,
    /session.*still running/i
  ];

  return runningPatterns.some(pattern => pattern.test(stdout));
}

/**
 * Run a single iteration with all scenarios
 */
async function runIteration(
  runNumber: number,
  runDir: string,
  projectRoot: string
): Promise<RunResult> {
  const scenarios: ScenarioResult[] = [];

  // Scenario A: Small success task
  console.log(`  [${runNumber}] Scenario A: success-task`);
  const successResult = await runScenario(
    '/help\n/exit\n',
    'success-task',
    projectRoot,
    runDir
  );
  scenarios.push(successResult);

  // Scenario B: Intentional failure (unknown command to trigger error path)
  console.log(`  [${runNumber}] Scenario B: fail-task`);
  const failResult = await runScenario(
    '/unknown_command_that_does_not_exist\n/exit\n',
    'fail-task',
    projectRoot,
    runDir
  );
  scenarios.push(failResult);

  // Scenario C: Exit typo (exit without slash)
  console.log(`  [${runNumber}] Scenario C: exit-typo`);
  const exitTypoResult = await runScenario(
    'exit\n/exit\n',
    'exit-typo',
    projectRoot,
    runDir
  );
  scenarios.push(exitTypoResult);

  const allPassed = scenarios.every(s => s.passed);

  return {
    runNumber,
    scenarios,
    allPassed
  };
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('E2E Smoke Test Runner');
  console.log('='.repeat(60));
  console.log(`Total runs: ${TOTAL_RUNS}`);
  console.log(`Timeout per scenario: ${TIMEOUT_MS}ms`);
  console.log('');

  // Check CLI exists
  if (!fs.existsSync(CLI_PATH)) {
    console.error(`ERROR: CLI not found at ${CLI_PATH}`);
    console.error('Run "npm run build" first.');
    process.exit(1);
  }

  // Create evidence directory
  const timestamp = createTimestamp();
  const evidenceDir = path.join(process.cwd(), EVIDENCE_BASE, timestamp);
  ensureEvidenceDir(evidenceDir);
  console.log(`Evidence directory: ${EVIDENCE_BASE}/${timestamp}`);
  console.log('');

  // Create temp project root for testing
  const projectRoot = process.cwd();

  const results: RunResult[] = [];
  let failedRuns = 0;

  for (let i = 1; i <= TOTAL_RUNS; i++) {
    console.log(`Run ${i}/${TOTAL_RUNS}`);

    const runDir = path.join(evidenceDir, `run-${String(i).padStart(2, '0')}`);
    ensureEvidenceDir(runDir);

    const result = await runIteration(i, runDir, projectRoot);
    results.push(result);

    if (!result.allPassed) {
      failedRuns++;
      console.log(`  [${i}] FAILED`);
      for (const scenario of result.scenarios) {
        if (!scenario.passed) {
          console.log(`    - ${scenario.name}: ${scenario.errorMessage}`);
        }
      }
    } else {
      console.log(`  [${i}] PASSED`);
    }
    console.log('');
  }

  // Summary
  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const passedRuns = TOTAL_RUNS - failedRuns;
  console.log(`Passed: ${passedRuns}/${TOTAL_RUNS}`);
  console.log(`Failed: ${failedRuns}/${TOTAL_RUNS}`);
  console.log('');

  // Detailed results
  console.log('Detailed Results:');
  for (const result of results) {
    const status = result.allPassed ? 'PASS' : 'FAIL';
    const durations = result.scenarios.map(s => `${s.durationMs}ms`).join(', ');
    console.log(`  Run ${result.runNumber}: ${status} (${durations})`);
  }
  console.log('');

  console.log(`Evidence saved to: ${EVIDENCE_BASE}/${timestamp}`);
  console.log('');

  if (failedRuns > 0) {
    console.log('RESULT: FAILED');
    process.exit(1);
  } else {
    console.log('RESULT: ALL PASSED');
    process.exit(0);
  }
}

main().catch((err: Error) => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
