/**
 * Test Incomplete Executor
 *
 * A test executor that can be configured via environment variable to simulate
 * different executor statuses (especially INCOMPLETE) for regression testing.
 *
 * Usage:
 *   PM_TEST_EXECUTOR_MODE=incomplete  → Returns INCOMPLETE with empty output
 *   PM_TEST_EXECUTOR_MODE=incomplete_with_output → Returns INCOMPLETE with output
 *   PM_TEST_EXECUTOR_MODE=no_evidence → Returns NO_EVIDENCE
 *   PM_TEST_EXECUTOR_MODE=complete → Returns COMPLETE
 *   PM_TEST_EXECUTOR_MODE=context_echo → Echo the prompt (for TaskContext E2E testing)
 *   (default) → Falls through to inner executor
 *
 * This enables gate:all to catch READ_INFO INCOMPLETE → ERROR regressions.
 */

import { IExecutor, ExecutorResult, ExecutorTask, AuthCheckResult } from './claude-code-executor';

/**
 * Test executor mode
 */
export type TestExecutorMode =
  | 'incomplete'              // INCOMPLETE with no output
  | 'incomplete_with_output'  // INCOMPLETE with output
  | 'no_evidence'             // NO_EVIDENCE status
  | 'complete'                // COMPLETE status
  | 'static_output'           // COMPLETE with static output (for E2E testing output visibility)
  | 'context_echo'            // Echo the received prompt (for TaskContext injection E2E testing)
  | 'error'                   // ERROR status
  | 'passthrough';            // Fall through to inner executor

/**
 * Get test executor mode from environment
 */
export function getTestExecutorMode(): TestExecutorMode {
  const mode = process.env.PM_TEST_EXECUTOR_MODE?.toLowerCase();
  switch (mode) {
    case 'incomplete':
      return 'incomplete';
    case 'incomplete_with_output':
      return 'incomplete_with_output';
    case 'no_evidence':
      return 'no_evidence';
    case 'complete':
      return 'complete';
    case 'static_output':
      return 'static_output';
    case 'context_echo':
      return 'context_echo';
    case 'error':
      return 'error';
    default:
      return 'passthrough';
  }
}

/**
 * Test executor that can simulate INCOMPLETE status for regression testing
 */
export class TestIncompleteExecutor implements IExecutor {
  private innerExecutor: IExecutor;
  private mode: TestExecutorMode;

  constructor(innerExecutor: IExecutor, mode?: TestExecutorMode) {
    this.innerExecutor = innerExecutor;
    this.mode = mode ?? getTestExecutorMode();
    if (this.mode !== 'passthrough') {
      console.log(`[TestIncompleteExecutor] Activated with mode: ${this.mode}`);
    }
  }

  async execute(task: ExecutorTask): Promise<ExecutorResult> {
    const startTime = Date.now();

    switch (this.mode) {
      case 'incomplete':
        console.log('[TestIncompleteExecutor] Returning INCOMPLETE with empty output');
        return {
          executed: true,
          output: '',  // Empty output
          files_modified: [],
          duration_ms: Date.now() - startTime,
          status: 'INCOMPLETE',
          cwd: process.cwd(),
          verified_files: [],
          unverified_files: [],
        };

      case 'incomplete_with_output':
        console.log('[TestIncompleteExecutor] Returning INCOMPLETE with output');
        return {
          executed: true,
          output: 'This is test output from incomplete executor. The task produced this response.',
          files_modified: [],
          duration_ms: Date.now() - startTime,
          status: 'INCOMPLETE',
          cwd: process.cwd(),
          verified_files: [],
          unverified_files: [],
        };

      case 'no_evidence':
        console.log('[TestIncompleteExecutor] Returning NO_EVIDENCE');
        return {
          executed: true,
          output: '',
          files_modified: [],
          duration_ms: Date.now() - startTime,
          status: 'NO_EVIDENCE',
          cwd: process.cwd(),
          verified_files: [],
          unverified_files: [],
        };

      case 'complete':
        console.log('[TestIncompleteExecutor] Returning COMPLETE');
        return {
          executed: true,
          output: 'Task completed successfully.',
          files_modified: ['test.txt'],
          duration_ms: Date.now() - startTime,
          status: 'COMPLETE',
          cwd: process.cwd(),
          verified_files: [{
            path: 'test.txt',
            exists: true,
            size: 100,
          }],
          unverified_files: [],
        };

      case 'static_output':
        // This mode is specifically for E2E testing output visibility in UI
        // The output should be visible in the Task Detail page
        console.log('[TestIncompleteExecutor] Returning COMPLETE with static output for UI visibility test');
        return {
          executed: true,
          output: 'E2E_TEST_OUTPUT: This is the task result that should be visible in the UI. If you can see this message, the output visibility fix is working correctly.',
          files_modified: [],
          duration_ms: Date.now() - startTime,
          status: 'COMPLETE',
          cwd: process.cwd(),
          verified_files: [],
          unverified_files: [],
        };

      case 'context_echo':
        // This mode echoes the received prompt back as output
        // Used for E2E testing of TaskContext injection
        console.log('[TestIncompleteExecutor] Returning COMPLETE with prompt echo (context_echo mode)');
        return {
          executed: true,
          output: task.prompt,  // Echo the entire prompt including injected TaskContext
          files_modified: [],
          duration_ms: Date.now() - startTime,
          status: 'COMPLETE',
          cwd: process.cwd(),
          verified_files: [],
          unverified_files: [],
        };

      case 'error':
        console.log('[TestIncompleteExecutor] Returning ERROR');
        return {
          executed: false,
          output: '',
          error: 'Simulated error from test executor',
          files_modified: [],
          duration_ms: Date.now() - startTime,
          status: 'ERROR',
          cwd: process.cwd(),
          verified_files: [],
          unverified_files: [],
        };

      case 'passthrough':
      default:
        // Fall through to inner executor
        return this.innerExecutor.execute(task);
    }
  }

  async isClaudeCodeAvailable(): Promise<boolean> {
    // In test mode, always return true to allow tests to proceed
    if (this.mode !== 'passthrough') {
      return true;
    }
    return this.innerExecutor.isClaudeCodeAvailable();
  }

  async checkAuthStatus(): Promise<AuthCheckResult> {
    // In test mode, return logged in status
    if (this.mode !== 'passthrough') {
      return {
        available: true,
        loggedIn: true,
      };
    }
    return this.innerExecutor.checkAuthStatus();
  }
}

/**
 * Wrap an executor with test capability
 * Only wraps if PM_TEST_EXECUTOR_MODE is set
 */
export function wrapWithTestExecutor(executor: IExecutor): IExecutor {
  const mode = getTestExecutorMode();
  if (mode === 'passthrough') {
    return executor;
  }
  return new TestIncompleteExecutor(executor, mode);
}
