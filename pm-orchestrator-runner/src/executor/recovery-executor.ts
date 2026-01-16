/**
 * Recovery Executor for E2E Recovery Testing
 *
 * Purpose: Simulate TIMEOUT, BLOCKED, and FAIL_CLOSED scenarios
 * to verify wrapper recovery behavior.
 *
 * ========================================
 * SAFETY: TEST-ONLY COMPONENT
 * ========================================
 * This executor is designed ONLY for E2E testing.
 * Production safety mechanisms:
 *   1. Requires explicit PM_EXECUTOR_MODE=recovery-stub
 *   2. Rejects activation when NODE_ENV=production
 *   3. Prints warning to stdout on activation
 *   4. All output contains mode=recovery-stub marker
 *
 * Activation:
 *   PM_EXECUTOR_MODE=recovery-stub
 *   PM_RECOVERY_SCENARIO=timeout|blocked|fail-closed
 *
 * Behaviors:
 *   TIMEOUT: Block indefinitely until watchdog kills (hard timeout)
 *   BLOCKED: Return output with interactive prompt patterns
 *   FAIL_CLOSED: Return ERROR status immediately
 *
 * E2E Verification Criteria:
 *   - Wrapper must recover from all scenarios
 *   - Exit code must be 0, 1, or 2 (graceful termination)
 *   - Immediate Summary must be visible (RESULT/TASK/HINT)
 *   - No RUNNING residue in session state
 */

import type {
  IExecutor,
  ExecutorTask,
  ExecutorResult,
} from './claude-code-executor';
import type { BlockedReason, TerminatedBy } from '../models/enums';

/**
 * Recovery scenario types
 */
export type RecoveryScenario = 'timeout' | 'blocked' | 'fail-closed';

/**
 * Check if running in production environment
 */
export function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Check if recovery mode is enabled
 *
 * SAFETY: Returns false if NODE_ENV=production
 */
export function isRecoveryMode(): boolean {
  // Production safety: reject recovery-stub in production
  if (isProductionEnvironment()) {
    return false;
  }
  return process.env.PM_EXECUTOR_MODE === 'recovery-stub';
}

/**
 * Attempt to enable recovery mode in production
 * This will fail-closed with process.exit(1) if attempted
 *
 * Call this early in the process to catch production misuse
 */
export function assertRecoveryModeAllowed(): void {
  if (process.env.PM_EXECUTOR_MODE === 'recovery-stub' && isProductionEnvironment()) {
    console.error('[FATAL] recovery-stub is forbidden in production (NODE_ENV=production)');
    console.error('[FATAL] mode=recovery-stub rejected');
    process.exit(1);
  }
}

/**
 * Print warning when recovery mode is activated
 * This MUST be visible in stdout for E2E verification
 */
export function printRecoveryModeWarning(): void {
  console.log('WARNING: recovery-stub enabled (test-only)');
  console.log('mode=recovery-stub');
}

/**
 * Get the current recovery scenario
 */
export function getRecoveryScenario(): RecoveryScenario | null {
  const scenario = process.env.PM_RECOVERY_SCENARIO;
  if (scenario === 'timeout' || scenario === 'blocked' || scenario === 'fail-closed') {
    return scenario;
  }
  return null;
}

/**
 * RecoveryExecutor - For E2E recovery testing
 *
 * Simulates failure scenarios that require wrapper recovery.
 * Each scenario tests a different recovery path.
 *
 * SAFETY: Constructor prints warning to stdout
 */
export class RecoveryExecutor implements IExecutor {
  private scenario: RecoveryScenario;

  constructor(scenario?: RecoveryScenario) {
    // Print warning on construction (visible in stdout)
    printRecoveryModeWarning();
    this.scenario = scenario || getRecoveryScenario() || 'timeout';
  }

  async isClaudeCodeAvailable(): Promise<boolean> {
    // In recovery mode, we simulate Claude Code availability
    return true;
  }

  async execute(task: ExecutorTask): Promise<ExecutorResult> {
    const startTime = Date.now();
    const cwd = task.workingDir;

    // Evidence marker for E2E verification
    console.log(`[RecoveryExecutor] mode=recovery-stub`);
    console.log(`[RecoveryExecutor] Scenario: ${this.scenario}, task: ${task.id}`);

    switch (this.scenario) {
      case 'timeout':
        return this.simulateTimeout(task, startTime, cwd);
      case 'blocked':
        return this.simulateBlocked(task, startTime, cwd);
      case 'fail-closed':
        return this.simulateFailClosed(task, startTime, cwd);
      default:
        // Should never happen, but fail-closed for safety
        return this.simulateFailClosed(task, startTime, cwd);
    }
  }

  /**
   * TIMEOUT scenario:
   * Block for a long time to trigger hard timeout in the wrapper.
   * The wrapper should detect no output and terminate.
   */
  private async simulateTimeout(
    task: ExecutorTask,
    startTime: number,
    cwd: string
  ): Promise<ExecutorResult> {
    console.log('[RecoveryExecutor] Simulating TIMEOUT - blocking for extended period');

    // Block for a very long time (the wrapper should kill us before this completes)
    // Using a reasonable time that exceeds hard timeout (default 120s)
    // For testing, we use a shorter time but longer than the test's configured timeout
    const blockDuration = parseInt(process.env.RECOVERY_TIMEOUT_BLOCK_MS || '150000', 10);

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, blockDuration);
      // Allow the timeout to be unrefd so the process can be killed
      timeout.unref();
    });

    // If we reach here, the wrapper failed to terminate us (test failure case)
    return {
      executed: false,
      output: '',
      error: 'TIMEOUT simulation - wrapper failed to terminate',
      files_modified: [],
      duration_ms: Date.now() - startTime,
      status: 'ERROR',
      cwd,
      verified_files: [],
      unverified_files: [],
      executor_blocked: true,
      blocked_reason: 'TIMEOUT' as BlockedReason,
      timeout_ms: Date.now() - startTime,
      terminated_by: 'TIMEOUT' as TerminatedBy,
    };
  }

  /**
   * BLOCKED scenario:
   * Return output containing interactive prompt patterns.
   * The wrapper should detect BLOCKED status and recover.
   */
  private async simulateBlocked(
    task: ExecutorTask,
    startTime: number,
    cwd: string
  ): Promise<ExecutorResult> {
    console.log('[RecoveryExecutor] Simulating BLOCKED - returning interactive prompt output');

    // Small delay to simulate some processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Return result indicating blocked status
    // This simulates what happens when Claude Code CLI hits an interactive prompt
    return {
      executed: false,
      output: 'Would you like to continue? [Y/n]',
      error: 'Executor blocked: INTERACTIVE_PROMPT',
      files_modified: [],
      duration_ms: Date.now() - startTime,
      status: 'BLOCKED',
      cwd,
      verified_files: [],
      unverified_files: [],
      executor_blocked: true,
      blocked_reason: 'INTERACTIVE_PROMPT' as BlockedReason,
      timeout_ms: Date.now() - startTime,
      terminated_by: 'REPL_FAIL_CLOSED' as TerminatedBy,
    };
  }

  /**
   * FAIL_CLOSED scenario:
   * Return ERROR status immediately.
   * Simulates executor crash or unexpected termination.
   */
  private async simulateFailClosed(
    task: ExecutorTask,
    startTime: number,
    cwd: string
  ): Promise<ExecutorResult> {
    console.log('[RecoveryExecutor] Simulating FAIL_CLOSED - returning error immediately');

    // Small delay to simulate some processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Return error result (simulates non-zero exit code)
    return {
      executed: false,
      output: 'Fatal error: simulated crash',
      error: 'Executor terminated unexpectedly (simulated FAIL_CLOSED)',
      files_modified: [],
      duration_ms: Date.now() - startTime,
      status: 'ERROR',
      cwd,
      verified_files: [],
      unverified_files: [],
      executor_blocked: false,
    };
  }
}

/**
 * Create recovery executor if in recovery mode
 *
 * SAFETY: Calls assertRecoveryModeAllowed() to reject production usage
 */
export function createRecoveryExecutor(): IExecutor | null {
  // Early fail-closed for production misuse
  assertRecoveryModeAllowed();

  if (isRecoveryMode()) {
    const scenario = getRecoveryScenario();
    if (scenario) {
      return new RecoveryExecutor(scenario);
    }
  }
  return null;
}
