/**
 * Recovery Executor for E2E Recovery Testing
 *
 * Purpose: Simulate TIMEOUT, BLOCKED, and FAIL_CLOSED scenarios
 * to verify wrapper recovery behavior.
 *
 * Activation:
 *   PM_EXECUTOR_MODE=recovery-stub
 *   PM_RECOVERY_SCENARIO=timeout|blocked|fail-closed
 *
 * Behaviors:
 *   TIMEOUT: Block indefinitely until watchdog kills (hard timeout)
 *   BLOCKED: Return output with interactive prompt patterns
 *   FAIL_CLOSED: Return ERROR status immediately
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
 * Check if recovery mode is enabled
 */
export function isRecoveryMode(): boolean {
  return process.env.PM_EXECUTOR_MODE === 'recovery-stub';
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
 */
export class RecoveryExecutor implements IExecutor {
  private scenario: RecoveryScenario;

  constructor(scenario?: RecoveryScenario) {
    this.scenario = scenario || getRecoveryScenario() || 'timeout';
  }

  async isClaudeCodeAvailable(): Promise<boolean> {
    // In recovery mode, we simulate Claude Code availability
    return true;
  }

  async execute(task: ExecutorTask): Promise<ExecutorResult> {
    const startTime = Date.now();
    const cwd = task.workingDir;

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
 */
export function createRecoveryExecutor(): IExecutor | null {
  if (isRecoveryMode()) {
    const scenario = getRecoveryScenario();
    if (scenario) {
      return new RecoveryExecutor(scenario);
    }
  }
  return null;
}
