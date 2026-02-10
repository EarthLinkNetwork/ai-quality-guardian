/**
 * Dynamic Timeout Executor
 *
 * AC C: Dynamic Control - LLM estimates task size to select monitoring profile
 *
 * This executor wraps ClaudeCodeExecutor and automatically selects appropriate
 * timeout profiles based on task analysis using the task-size-estimator.
 */
import { ExecutorConfig, ExecutorTask, ExecutorResult, IExecutor, AuthCheckResult } from './claude-code-executor';
import { TaskSizeEstimate, TaskSizeCategory } from '../utils/task-size-estimator';
import { TimeoutProfile } from '../utils/timeout-profile';
/**
 * Dynamic executor configuration
 *
 * Extends ExecutorConfig with options for dynamic timeout selection
 */
export interface DynamicExecutorConfig extends Omit<ExecutorConfig, 'softTimeoutMs' | 'disableOverallTimeout'> {
    /** Use dynamic profile selection based on task analysis (default: true) */
    useDynamicProfiles?: boolean;
    /** Override profile - if set, always use this profile instead of dynamic selection */
    overrideProfile?: TimeoutProfile;
    /** Minimum category to enable extended timeouts (default: 'large') */
    extendedTimeoutMinCategory?: TaskSizeCategory;
    /** Log profile selection decisions (default: false) */
    logProfileSelection?: boolean;
}
/**
 * Task execution context with size estimation
 */
export interface TaskExecutionContext {
    task: ExecutorTask;
    estimate: TaskSizeEstimate;
    profile: TimeoutProfile;
    executorConfig: ExecutorConfig;
}
/**
 * Dynamic execution result with estimation metadata
 */
export interface DynamicExecutorResult extends ExecutorResult {
    /** Task size estimation used */
    taskSizeEstimate?: TaskSizeEstimate;
    /** Selected timeout profile */
    selectedProfile?: TimeoutProfile;
}
/**
 * Dynamic Timeout Executor
 *
 * Analyzes task prompts to estimate complexity and automatically selects
 * appropriate timeout profiles. Delegates actual execution to ClaudeCodeExecutor.
 *
 * Features:
 * - Rule-based task size estimation (no LLM overhead)
 * - Automatic profile selection (STANDARD/LONG/EXTENDED)
 * - TaskType integration for refined estimation
 * - Profile override capability
 *
 * Usage:
 * ```typescript
 * const executor = new DynamicTimeoutExecutor({
 *   projectPath: '/path/to/project',
 *   timeout: 600000,
 * });
 *
 * // Profile is automatically selected based on task prompt
 * const result = await executor.execute({
 *   id: 'task-1',
 *   prompt: 'refactor the entire authentication system',
 *   workingDir: '/path/to/project',
 * });
 *
 * // Result includes estimation metadata
 * console.log(result.taskSizeEstimate?.category); // 'large'
 * console.log(result.selectedProfile?.name); // 'long'
 * ```
 */
export declare class DynamicTimeoutExecutor implements IExecutor {
    private readonly config;
    private readonly useDynamicProfiles;
    private readonly logProfileSelection;
    private readonly extendedTimeoutMinCategory;
    constructor(config: DynamicExecutorConfig);
    /**
     * Estimate task size and select appropriate profile
     *
     * @param task - Task to analyze
     * @returns Task execution context with estimation and profile
     */
    analyzeTask(task: ExecutorTask): TaskExecutionContext;
    /**
     * Determine if overall timeout should be disabled
     *
     * For very large tasks (x-large) or extended profiles, we may want to
     * disable the overall timeout safety net to allow completion.
     *
     * @param category - Task size category
     * @returns Whether to disable overall timeout
     */
    private shouldDisableOverallTimeout;
    /**
     * Execute a task with dynamic timeout profile selection
     *
     * @param task - Task to execute
     * @returns Execution result with estimation metadata
     */
    execute(task: ExecutorTask): Promise<DynamicExecutorResult>;
    /**
     * Check if Claude Code CLI is available
     *
     * @returns true if CLI is available
     */
    isClaudeCodeAvailable(): Promise<boolean>;
    /**
     * Check authentication status
     *
     * @returns Auth status result
     */
    checkAuthStatus(): Promise<AuthCheckResult>;
    /**
     * Get the underlying config
     */
    getConfig(): DynamicExecutorConfig;
    /**
     * Create a new executor with modified config
     */
    withConfig(overrides: Partial<DynamicExecutorConfig>): DynamicTimeoutExecutor;
}
/**
 * Create a dynamic timeout executor with sensible defaults
 *
 * @param projectPath - Project path
 * @param timeout - Overall timeout (default: 10 minutes)
 * @param options - Additional options
 * @returns Configured DynamicTimeoutExecutor
 */
export declare function createDynamicExecutor(projectPath: string, timeout?: number, options?: Partial<DynamicExecutorConfig>): DynamicTimeoutExecutor;
/**
 * Analyze a task without executing it
 *
 * Useful for pre-flight checks or logging task complexity.
 *
 * @param prompt - Task prompt to analyze
 * @param taskType - Optional task type for refined estimation
 * @returns Task size estimate
 */
export declare function analyzeTaskPrompt(prompt: string, taskType?: string): TaskSizeEstimate;
//# sourceMappingURL=dynamic-timeout-executor.d.ts.map