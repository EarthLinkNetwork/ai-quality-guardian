/**
 * StepwiseMockExecutor
 *
 * A mock executor that returns different results based on call count.
 * Used for testing the self-heal mediation loop.
 *
 * Per spec:
 * - Step 1: Returns buggy implementation -> INCOMPLETE
 * - Step 2: Returns fixed implementation -> COMPLETE
 */
import type { IExecutor, ExecutorTask, ExecutorResult, AuthCheckResult } from './claude-code-executor';
/**
 * Step configuration for StepwiseMockExecutor
 */
export interface StepConfig {
    /** Status to return for this step */
    status: ExecutorResult['status'];
    /** Output message */
    output: string;
    /** Files to create/modify (relative paths) */
    filesToCreate?: Array<{
        path: string;
        content: string;
    }>;
    /** Whether npm test should pass after this step */
    testShouldPass?: boolean;
    /** Custom handler for complex scenarios */
    customHandler?: (task: ExecutorTask, projectPath: string) => Promise<Partial<ExecutorResult>>;
}
/**
 * Configuration for StepwiseMockExecutor
 */
export interface StepwiseMockConfig {
    /** Path to the project being tested */
    projectPath: string;
    /** Steps to execute in order */
    steps: StepConfig[];
    /** Default status when steps are exhausted */
    defaultStatus?: ExecutorResult['status'];
}
/**
 * StepwiseMockExecutor
 *
 * Varies results based on call count to simulate:
 * 1. Initial buggy implementation (INCOMPLETE)
 * 2. Correction/fix (COMPLETE)
 */
export declare class StepwiseMockExecutor implements IExecutor {
    private callCount;
    private config;
    private executionLog;
    constructor(config: StepwiseMockConfig);
    /**
     * Get current call count
     */
    getCallCount(): number;
    /**
     * Get execution log for verification
     */
    getExecutionLog(): typeof this.executionLog;
    /**
     * Reset executor state
     */
    reset(): void;
    isClaudeCodeAvailable(): Promise<boolean>;
    checkAuthStatus(): Promise<AuthCheckResult>;
    execute(task: ExecutorTask): Promise<ExecutorResult>;
}
/**
 * Create a StepwiseMockExecutor configured for the tiny-cli self-heal test
 *
 * Step 1: Creates buggy implementation (tests fail) -> INCOMPLETE
 * Step 2: Creates fixed implementation (tests pass) -> COMPLETE
 */
export declare function createTinyCliMockExecutor(projectPath: string): StepwiseMockExecutor;
//# sourceMappingURL=stepwise-mock-executor.d.ts.map