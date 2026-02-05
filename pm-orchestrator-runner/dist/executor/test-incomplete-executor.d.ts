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
export type TestExecutorMode = 'incomplete' | 'incomplete_with_output' | 'no_evidence' | 'complete' | 'static_output' | 'context_echo' | 'error' | 'passthrough';
/**
 * Get test executor mode from environment
 */
export declare function getTestExecutorMode(): TestExecutorMode;
/**
 * Test executor that can simulate INCOMPLETE status for regression testing
 */
export declare class TestIncompleteExecutor implements IExecutor {
    private innerExecutor;
    private mode;
    constructor(innerExecutor: IExecutor, mode?: TestExecutorMode);
    execute(task: ExecutorTask): Promise<ExecutorResult>;
    isClaudeCodeAvailable(): Promise<boolean>;
    checkAuthStatus(): Promise<AuthCheckResult>;
}
/**
 * Wrap an executor with test capability
 * Only wraps if PM_TEST_EXECUTOR_MODE is set
 */
export declare function wrapWithTestExecutor(executor: IExecutor): IExecutor;
//# sourceMappingURL=test-incomplete-executor.d.ts.map