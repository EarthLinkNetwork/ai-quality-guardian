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
import type { IExecutor, ExecutorTask, ExecutorResult } from './claude-code-executor';
/**
 * Recovery scenario types
 */
export type RecoveryScenario = 'timeout' | 'blocked' | 'fail-closed';
/**
 * Check if running in production environment
 */
export declare function isProductionEnvironment(): boolean;
/**
 * Check if recovery mode is enabled
 *
 * SAFETY: Returns false if NODE_ENV=production
 */
export declare function isRecoveryMode(): boolean;
/**
 * Attempt to enable recovery mode in production
 * This will fail-closed with process.exit(1) if attempted
 *
 * Call this early in the process to catch production misuse
 */
export declare function assertRecoveryModeAllowed(): void;
/**
 * Print warning when recovery mode is activated
 * This MUST be visible in stdout for E2E verification
 */
export declare function printRecoveryModeWarning(): void;
/**
 * Get the current recovery scenario
 */
export declare function getRecoveryScenario(): RecoveryScenario | null;
/**
 * RecoveryExecutor - For E2E recovery testing
 *
 * Simulates failure scenarios that require wrapper recovery.
 * Each scenario tests a different recovery path.
 *
 * SAFETY: Constructor prints warning to stdout
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
 *
 * SAFETY: Calls assertRecoveryModeAllowed() to reject production usage
 */
export declare function createRecoveryExecutor(): IExecutor | null;
//# sourceMappingURL=recovery-executor.d.ts.map