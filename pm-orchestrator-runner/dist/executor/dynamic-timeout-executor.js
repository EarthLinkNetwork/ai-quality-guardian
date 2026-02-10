"use strict";
/**
 * Dynamic Timeout Executor
 *
 * AC C: Dynamic Control - LLM estimates task size to select monitoring profile
 *
 * This executor wraps ClaudeCodeExecutor and automatically selects appropriate
 * timeout profiles based on task analysis using the task-size-estimator.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamicTimeoutExecutor = void 0;
exports.createDynamicExecutor = createDynamicExecutor;
exports.analyzeTaskPrompt = analyzeTaskPrompt;
const claude_code_executor_1 = require("./claude-code-executor");
const task_size_estimator_1 = require("../utils/task-size-estimator");
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
class DynamicTimeoutExecutor {
    config;
    useDynamicProfiles;
    logProfileSelection;
    extendedTimeoutMinCategory;
    constructor(config) {
        this.config = config;
        this.useDynamicProfiles = config.useDynamicProfiles ?? true;
        this.logProfileSelection = config.logProfileSelection ?? false;
        this.extendedTimeoutMinCategory = config.extendedTimeoutMinCategory ?? 'large';
    }
    /**
     * Estimate task size and select appropriate profile
     *
     * @param task - Task to analyze
     * @returns Task execution context with estimation and profile
     */
    analyzeTask(task) {
        // Estimate task size
        const estimate = (0, task_size_estimator_1.estimateTaskSize)(task.prompt, task.taskType);
        // Select profile (override if configured)
        let profile;
        if (this.config.overrideProfile) {
            profile = this.config.overrideProfile;
        }
        else if (this.useDynamicProfiles) {
            profile = estimate.recommendedProfile;
        }
        else {
            // Use quick estimate profile as fallback
            profile = (0, task_size_estimator_1.quickEstimateProfile)(task.prompt, task.taskType);
        }
        // Build executor config from profile
        const executorConfig = {
            projectPath: this.config.projectPath,
            timeout: this.config.timeout,
            cliPath: this.config.cliPath,
            softTimeoutMs: profile.idle_timeout_ms,
            silenceLogIntervalMs: Math.min(profile.idle_timeout_ms / 2, 30000), // Half of idle timeout, max 30s
            verbose: this.config.verbose,
            disableOverallTimeout: this.shouldDisableOverallTimeout(estimate.category),
        };
        if (this.logProfileSelection) {
            console.log(`[DynamicTimeoutExecutor] Task analysis:
  Category: ${estimate.category}
  Confidence: ${(estimate.confidence * 100).toFixed(0)}%
  Profile: ${profile.name}
  Idle timeout: ${profile.idle_timeout_ms}ms
  Hard timeout: ${profile.hard_timeout_ms}ms
  Factors: ${estimate.factors.map(f => `${f.name}(${f.score.toFixed(2)})`).join(', ')}`);
        }
        return {
            task,
            estimate,
            profile,
            executorConfig,
        };
    }
    /**
     * Determine if overall timeout should be disabled
     *
     * For very large tasks (x-large) or extended profiles, we may want to
     * disable the overall timeout safety net to allow completion.
     *
     * @param category - Task size category
     * @returns Whether to disable overall timeout
     */
    shouldDisableOverallTimeout(category) {
        const categoryOrder = ['small', 'medium', 'large', 'x-large'];
        const minCategoryIndex = categoryOrder.indexOf(this.extendedTimeoutMinCategory);
        const currentIndex = categoryOrder.indexOf(category);
        // Disable overall timeout for categories at or above the threshold
        return currentIndex >= minCategoryIndex && category === 'x-large';
    }
    /**
     * Execute a task with dynamic timeout profile selection
     *
     * @param task - Task to execute
     * @returns Execution result with estimation metadata
     */
    async execute(task) {
        // Analyze task and select profile
        const context = this.analyzeTask(task);
        // Create executor with selected profile
        const executor = new claude_code_executor_1.ClaudeCodeExecutor(context.executorConfig);
        // Execute task
        const result = await executor.execute(task);
        // Return result with estimation metadata
        return {
            ...result,
            taskSizeEstimate: context.estimate,
            selectedProfile: context.profile,
        };
    }
    /**
     * Check if Claude Code CLI is available
     *
     * @returns true if CLI is available
     */
    async isClaudeCodeAvailable() {
        const executor = new claude_code_executor_1.ClaudeCodeExecutor({
            projectPath: this.config.projectPath,
            timeout: this.config.timeout,
            cliPath: this.config.cliPath,
        });
        return executor.isClaudeCodeAvailable();
    }
    /**
     * Check authentication status
     *
     * @returns Auth status result
     */
    async checkAuthStatus() {
        const executor = new claude_code_executor_1.ClaudeCodeExecutor({
            projectPath: this.config.projectPath,
            timeout: this.config.timeout,
            cliPath: this.config.cliPath,
        });
        return executor.checkAuthStatus();
    }
    /**
     * Get the underlying config
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Create a new executor with modified config
     */
    withConfig(overrides) {
        return new DynamicTimeoutExecutor({
            ...this.config,
            ...overrides,
        });
    }
}
exports.DynamicTimeoutExecutor = DynamicTimeoutExecutor;
/**
 * Create a dynamic timeout executor with sensible defaults
 *
 * @param projectPath - Project path
 * @param timeout - Overall timeout (default: 10 minutes)
 * @param options - Additional options
 * @returns Configured DynamicTimeoutExecutor
 */
function createDynamicExecutor(projectPath, timeout = 600000, options) {
    return new DynamicTimeoutExecutor({
        projectPath,
        timeout,
        ...options,
    });
}
/**
 * Analyze a task without executing it
 *
 * Useful for pre-flight checks or logging task complexity.
 *
 * @param prompt - Task prompt to analyze
 * @param taskType - Optional task type for refined estimation
 * @returns Task size estimate
 */
function analyzeTaskPrompt(prompt, taskType) {
    return (0, task_size_estimator_1.estimateTaskSize)(prompt, taskType);
}
//# sourceMappingURL=dynamic-timeout-executor.js.map