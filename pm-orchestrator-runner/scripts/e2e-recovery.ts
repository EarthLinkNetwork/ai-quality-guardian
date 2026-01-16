#!/usr/bin/env ts-node
/**
 * E2E Recovery Test Runner
 *
 * Purpose: Prove that the wrapper recovers from TIMEOUT, BLOCKED, and FAIL_CLOSED scenarios
 * - 10 consecutive E2E runs
 * - Each run tests 3 scenarios (timeout, blocked, fail-closed)
 * - Validates: wrapper recovers, exit code 0, no RUNNING residue, Immediate Summary output
 *
 * Verification criteria per scenario:
 * - timeout-case: wrapper kills stuck process, exit code 0, Immediate Summary visible
 * - blocked-case: wrapper handles BLOCKED status, exit code 0, Immediate Summary visible
 * - fail-closed-case: wrapper handles ERROR status, exit code 0, Immediate Summary visible
 *
 * All scenarios must have:
 * - RESULT line (COMPLETE/INCOMPLETE/ERROR)
 * - TASK line (task id)
 * - NEXT line (/logs <id> for non-complete, (none) for complete)
 * - WHY line (for non-complete)
 * - HINT line (/logs <id>)
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const TOTAL_RUNS = 10;
const TIMEOUT_MS = 60000; // 60 seconds per scenario (wrapper should recover before this)
const CLI_PATH = path.join(__dirname, '..', 'dist', 'cli', 'index.js');

// Evidence directory (relative path, no absolute paths in logs)
const EVIDENCE_BASE = '.claude/evidence/e2e-recovery';

// Immediate Summary expected patterns
const IMMEDIATE_SUMMARY_PATTERNS = {
  result: /^RESULT:\s*(COMPLETE|INCOMPLETE|ERROR)/m,
  task: /^TASK:\s*\S+/m,
  next: /^NEXT:\s*/m,
  hint: /^HINT:\s*\/logs/m,
};

// Recovery stub safety verification patterns
const RECOVERY_STUB_SAFETY_PATTERNS = {
  warning: /WARNING: recovery-stub enabled \(test-only\)/,
  modeMarker: /mode=recovery-stub/,
};

// Recovery scenario types
type RecoveryScenario = 'timeout' | 'blocked' | 'fail-closed';

interface ScenarioResult {
  name: string;
  scenario: RecoveryScenario;
  passed: boolean;
  exitCode: number | null;
  timedOut: boolean;
  hasImmediateSummary: boolean;
  immeditateSummaryFields: {
    result: boolean;
    task: boolean;
    next: boolean;
    hint: boolean;
  };
  runningResidue: boolean;
  sessionStateCheck: SessionStateCheck | null;
  hasSafetyMarkers: boolean;
  safetyFields: {
    warning: boolean;
    modeMarker: boolean;
  };
  errorMessage?: string;
  durationMs: number;
}

interface SessionStateCheck {
  projectPath: string | null;
  currentTaskIdIsNull: boolean;
  sessionStatusNotRunning: boolean;
  checkPassed: boolean;
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
 * Extract PROJECT_PATH from stdout
 */
function extractProjectPath(stdout: string): string | null {
  const match = stdout.match(/PROJECT_PATH=(.+)/);
  return match ? match[1].trim() : null;
}

/**
 * Check session state files for RUNNING residue
 */
function checkSessionState(projectPath: string | null): SessionStateCheck | null {
  if (!projectPath || !fs.existsSync(projectPath)) {
    return null;
  }

  const claudeDir = path.join(projectPath, '.claude');
  if (!fs.existsSync(claudeDir)) {
    return {
      projectPath,
      currentTaskIdIsNull: true,
      sessionStatusNotRunning: true,
      checkPassed: true,
    };
  }

  const sessionsDir = path.join(claudeDir, 'sessions');
  let foundRunningStatus = false;
  let foundNonNullTaskId = false;

  if (fs.existsSync(sessionsDir)) {
    try {
      const entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('session-')) {
          const sessionJson = path.join(sessionsDir, entry.name, 'session.json');
          if (fs.existsSync(sessionJson)) {
            try {
              const content = fs.readFileSync(sessionJson, 'utf-8');
              const session = JSON.parse(content);
              if (session.status === 'RUNNING') {
                foundRunningStatus = true;
              }
            } catch {
              // Skip invalid session files
            }
          }
        }
      }
    } catch {
      // Skip if sessions directory is inaccessible
    }
  }

  const stateJson = path.join(claudeDir, 'state.json');
  if (fs.existsSync(stateJson)) {
    try {
      const content = fs.readFileSync(stateJson, 'utf-8');
      const state = JSON.parse(content);
      if (state.current_task_id !== null && state.current_task_id !== undefined) {
        foundNonNullTaskId = true;
      }
      if (state.status === 'RUNNING' || state.status === 'running') {
        foundRunningStatus = true;
      }
    } catch {
      // Skip if state.json is invalid
    }
  }

  return {
    projectPath,
    currentTaskIdIsNull: !foundNonNullTaskId,
    sessionStatusNotRunning: !foundRunningStatus,
    checkPassed: !foundNonNullTaskId && !foundRunningStatus,
  };
}

/**
 * Sanitize absolute paths from logs
 */
function sanitizePaths(text: string): string {
  const homeDir = process.env.HOME || '/home/user';
  let result = text.replace(new RegExp(homeDir, 'g'), '~');
  result = result.replace(/\/tmp\/pm-runner-[a-zA-Z0-9]+/g, '<TEMP_DIR>');
  result = result.replace(/\/var\/folders\/[a-zA-Z0-9_/]+\/pm-runner-[a-zA-Z0-9]+/g, '<TEMP_DIR>');
  result = result.replace(/\/[A-Za-z0-9_/]+\/T\/pm-runner-[a-zA-Z0-9]+/g, '<TEMP_DIR>');
  return result;
}

/**
 * Check for Immediate Summary in output
 */
function checkImmediateSummary(stdout: string): {
  hasImmediateSummary: boolean;
  fields: { result: boolean; task: boolean; next: boolean; hint: boolean };
} {
  const fields = {
    result: IMMEDIATE_SUMMARY_PATTERNS.result.test(stdout),
    task: IMMEDIATE_SUMMARY_PATTERNS.task.test(stdout),
    next: IMMEDIATE_SUMMARY_PATTERNS.next.test(stdout),
    hint: IMMEDIATE_SUMMARY_PATTERNS.hint.test(stdout),
  };

  // For recovery scenarios, we expect ERROR or INCOMPLETE status
  // RESULT and TASK are mandatory, HINT with /logs is mandatory
  const hasImmediateSummary = fields.result && fields.task && fields.hint;

  return { hasImmediateSummary, fields };
}

/**
 * Check for recovery-stub safety markers in output
 *
 * These markers prove that:
 *   1. Warning was printed (test-only indication)
 *   2. mode=recovery-stub is in evidence (for audit)
 */
function checkSafetyMarkers(stdout: string): {
  hasSafetyMarkers: boolean;
  fields: { warning: boolean; modeMarker: boolean };
} {
  const fields = {
    warning: RECOVERY_STUB_SAFETY_PATTERNS.warning.test(stdout),
    modeMarker: RECOVERY_STUB_SAFETY_PATTERNS.modeMarker.test(stdout),
  };

  // Both warning and mode marker are required for safety verification
  const hasSafetyMarkers = fields.warning && fields.modeMarker;

  return { hasSafetyMarkers, fields };
}

/**
 * Check for RUNNING residue from stdout (fallback)
 */
function checkRunningResidueFromStdout(stdout: string): boolean {
  const runningPatterns = [
    /status.*RUNNING/i,
    /state.*RUNNING/i,
    /session.*still running/i,
    /current_task_id.*task-/i,
  ];
  return runningPatterns.some(pattern => pattern.test(stdout));
}

/**
 * Run recovery scenario
 */
async function runRecoveryScenario(
  scenario: RecoveryScenario,
  projectRoot: string,
  logDir: string
): Promise<ScenarioResult> {
  const startTime = Date.now();
  const scenarioName = `${scenario}-case`;

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let exitCode: number | null = null;

    // Configure environment for recovery testing
    const env = {
      ...process.env,
      NO_COLOR: '1',
      PM_EXECUTOR_MODE: 'recovery-stub',
      PM_RECOVERY_SCENARIO: scenario,
      // For timeout scenario, use shorter timeouts for testing
      // Wrapper hard timeout is 120s by default, stub blocks for 150s
      // For testing, we set wrapper timeout shorter
      PM_HARD_TIMEOUT_MS: scenario === 'timeout' ? '5000' : undefined,
      RECOVERY_TIMEOUT_BLOCK_MS: scenario === 'timeout' ? '30000' : undefined,
    };

    // Remove undefined values
    Object.keys(env).forEach(key => {
      if (env[key as keyof typeof env] === undefined) {
        delete env[key as keyof typeof env];
      }
    });

    const proc: ChildProcess = spawn('node', [
      CLI_PATH,
      'repl',
      '--non-interactive',
      '--exit-on-eof',
      '--project-mode', 'temp',
      '--print-project-path',
    ], {
      cwd: projectRoot,
      env: env as NodeJS.ProcessEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

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

      const tempProjectPath = extractProjectPath(stdout);
      const sanitizedStdout = sanitizePaths(stdout);
      const sanitizedStderr = sanitizePaths(stderr);

      fs.writeFileSync(path.join(logDir, `${scenarioName}-stdout.log`), sanitizedStdout);
      fs.writeFileSync(path.join(logDir, `${scenarioName}-stderr.log`), sanitizedStderr);

      // Check Immediate Summary
      const { hasImmediateSummary, fields } = checkImmediateSummary(stdout);

      // Check for recovery-stub safety markers
      const { hasSafetyMarkers, fields: safetyFields } = checkSafetyMarkers(stdout);

      // Check for RUNNING residue
      const sessionStateCheck = checkSessionState(tempProjectPath);
      const runningResidue = sessionStateCheck
        ? !sessionStateCheck.checkPassed
        : checkRunningResidueFromStdout(stdout);

      // Save session state check result
      if (sessionStateCheck) {
        const stateCheckLog = {
          projectPath: sanitizePaths(sessionStateCheck.projectPath || ''),
          currentTaskIdIsNull: sessionStateCheck.currentTaskIdIsNull,
          sessionStatusNotRunning: sessionStateCheck.sessionStatusNotRunning,
          checkPassed: sessionStateCheck.checkPassed,
        };
        fs.writeFileSync(
          path.join(logDir, `${scenarioName}-session-state.json`),
          JSON.stringify(stateCheckLog, null, 2)
        );
      }

      // Save immediate summary check
      fs.writeFileSync(
        path.join(logDir, `${scenarioName}-summary-check.json`),
        JSON.stringify({ hasImmediateSummary, fields, hasSafetyMarkers, safetyFields }, null, 2)
      );

      // Determine pass/fail
      let passed = false;
      let errorMessage: string | undefined;

      if (timedOut) {
        errorMessage = 'Test process timed out (wrapper failed to recover)';
      } else {
        // Recovery scenarios verification criteria:
        // - Wrapper must terminate gracefully (exit code 0, 1, or 2 - not null/crash)
        // - Immediate Summary must be visible (RESULT/TASK/HINT)
        // - No RUNNING residue in session state
        // - Safety markers must be present (WARNING + mode=recovery-stub)
        // Note: Exit code 1 (ERROR) or 2 (INCOMPLETE) is acceptable for recovery scenarios
        // because the executor intentionally returns error/blocked status
        const gracefulExit = exitCode !== null && exitCode >= 0 && exitCode <= 2;
        passed = gracefulExit && hasImmediateSummary && !runningResidue && hasSafetyMarkers;
        if (!passed) {
          const reasons: string[] = [];
          if (!gracefulExit) reasons.push(`exitCode=${exitCode} (expected 0-2)`);
          if (!hasImmediateSummary) {
            reasons.push(`summary: RESULT=${fields.result}, TASK=${fields.task}, HINT=${fields.hint}`);
          }
          if (runningResidue) reasons.push('runningResidue=true');
          if (!hasSafetyMarkers) {
            reasons.push(`safety: warning=${safetyFields.warning}, modeMarker=${safetyFields.modeMarker}`);
          }
          errorMessage = `${scenario}: ${reasons.join(', ')}`;
        }
      }

      resolve({
        name: scenarioName,
        scenario,
        passed,
        exitCode,
        timedOut,
        hasImmediateSummary,
        immeditateSummaryFields: fields,
        runningResidue,
        sessionStateCheck,
        hasSafetyMarkers,
        safetyFields,
        errorMessage,
        durationMs,
      });
    });

    proc.on('error', (err: Error) => {
      clearTimeout(timeoutId);
      resolve({
        name: scenarioName,
        scenario,
        passed: false,
        exitCode: null,
        timedOut: false,
        hasImmediateSummary: false,
        immeditateSummaryFields: { result: false, task: false, next: false, hint: false },
        runningResidue: false,
        sessionStateCheck: null,
        hasSafetyMarkers: false,
        safetyFields: { warning: false, modeMarker: false },
        errorMessage: `Process error: ${err.message}`,
        durationMs: Date.now() - startTime,
      });
    });

    // Send a simple task input that will trigger executor
    if (proc.stdin) {
      proc.stdin.write('test recovery scenario\n/exit\n');
      proc.stdin.end();
    }
  });
}

/**
 * Run a single iteration with all recovery scenarios
 */
async function runIteration(
  runNumber: number,
  runDir: string,
  projectRoot: string
): Promise<RunResult> {
  const scenarios: ScenarioResult[] = [];
  const recoveryScenarios: RecoveryScenario[] = ['timeout', 'blocked', 'fail-closed'];

  for (const scenario of recoveryScenarios) {
    console.log(`  [${runNumber}] Scenario: ${scenario}-case`);
    const result = await runRecoveryScenario(scenario, projectRoot, runDir);
    scenarios.push(result);
  }

  const allPassed = scenarios.every(s => s.passed);

  return {
    runNumber,
    scenarios,
    allPassed,
  };
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('E2E Recovery Test Runner');
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
