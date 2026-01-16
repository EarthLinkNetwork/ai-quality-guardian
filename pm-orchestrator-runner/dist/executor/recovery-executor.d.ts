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
import type { IExecutor, ExecutorTask, ExecutorResult } from './claude-code-executor';
/**
 * Recovery scenario types
 */
export type RecoveryScenario = 'timeout' | 'blocked' | 'fail-closed';
/**
 * Check if recovery mode is enabled
 */
export declare function isRecoveryMode(): boolean;
/**
 * Get the current recovery scenario
 */
export declare function getRecoveryScenario(): RecoveryScenario | null;
/**
 * RecoveryExecutor - For E2E recovery testing
 *
 * Simulates failure scenarios that require wrapper recovery.
 * Each scenario tests a different recovery path.
 */
export declare class RecoveryExecutor implements IExecutor {
    private scenario;
    constructor(scenario?: RecoveryScenario);
    isClaudeCodeAvailable(): Promise<boolean>;
    execute(task: ExecutorTask): Promise<ExecutorResult>;
    /**
     * TIMEOUT scenario:
     * Block for a long time to trigger hard timeout in the wrapper.
     * The wrapper should detect no output and terminate.
     */
    private simulateTimeout;
    /**
     * BLOCKED scenario:
     * Return output containing interactive prompt patterns.
     * The wrapper should detect BLOCKED status and recover.
     */
    private simulateBlocked;
    /**
     * FAIL_CLOSED scenario:
     * Return ERROR status immediately.
     * Simulates executor crash or unexpected termination.
     */
    private simulateFailClosed;
}
/**
 * Create recovery executor if in recovery mode
 */
export declare function createRecoveryExecutor(): IExecutor | null;
//# sourceMappingURL=recovery-executor.d.ts.map