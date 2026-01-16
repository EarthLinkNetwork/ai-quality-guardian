"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecoveryExecutor = void 0;
exports.isRecoveryMode = isRecoveryMode;
exports.getRecoveryScenario = getRecoveryScenario;
exports.createRecoveryExecutor = createRecoveryExecutor;
/**
 * Check if recovery mode is enabled
 */
function isRecoveryMode() {
    return process.env.PM_EXECUTOR_MODE === 'recovery-stub';
}
/**
 * Get the current recovery scenario
 */
function getRecoveryScenario() {
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
class RecoveryExecutor {
    scenario;
    constructor(scenario) {
        this.scenario = scenario || getRecoveryScenario() || 'timeout';
    }
    async isClaudeCodeAvailable() {
        // In recovery mode, we simulate Claude Code availability
        return true;
    }
    async execute(task) {
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
    async simulateTimeout(task, startTime, cwd) {
        console.log('[RecoveryExecutor] Simulating TIMEOUT - blocking for extended period');
        // Block for a very long time (the wrapper should kill us before this completes)
        // Using a reasonable time that exceeds hard timeout (default 120s)
        // For testing, we use a shorter time but longer than the test's configured timeout
        const blockDuration = parseInt(process.env.RECOVERY_TIMEOUT_BLOCK_MS || '150000', 10);
        await new Promise((resolve) => {
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
            blocked_reason: 'TIMEOUT',
            timeout_ms: Date.now() - startTime,
            terminated_by: 'TIMEOUT',
        };
    }
    /**
     * BLOCKED scenario:
     * Return output containing interactive prompt patterns.
     * The wrapper should detect BLOCKED status and recover.
     */
    async simulateBlocked(task, startTime, cwd) {
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
            blocked_reason: 'INTERACTIVE_PROMPT',
            timeout_ms: Date.now() - startTime,
            terminated_by: 'REPL_FAIL_CLOSED',
        };
    }
    /**
     * FAIL_CLOSED scenario:
     * Return ERROR status immediately.
     * Simulates executor crash or unexpected termination.
     */
    async simulateFailClosed(task, startTime, cwd) {
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
exports.RecoveryExecutor = RecoveryExecutor;
/**
 * Create recovery executor if in recovery mode
 */
function createRecoveryExecutor() {
    if (isRecoveryMode()) {
        const scenario = getRecoveryScenario();
        if (scenario) {
            return new RecoveryExecutor(scenario);
        }
    }
    return null;
}
//# sourceMappingURL=recovery-executor.js.map