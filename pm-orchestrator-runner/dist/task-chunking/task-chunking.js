"use strict";
/**
 * Task Chunking Module
 *
 * Per spec 26_TASK_CHUNKING.md: Automatic task splitting with parallel/sequential execution
 *
 * Features:
 * - Automatic task decomposition into subtasks
 * - Parallel and sequential execution modes
 * - Auto-retry with exponential backoff
 * - Integration with Review Loop
 * - Comprehensive logging
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskChunkingExecutorWrapper = exports.DEFAULT_TASK_CHUNKING_CONFIG = void 0;
exports.analyzeTaskForChunking = analyzeTaskForChunking;
exports.calculateRetryDelay = calculateRetryDelay;
exports.shouldRetry = shouldRetry;
exports.generateSubtaskId = generateSubtaskId;
exports.createSubtaskDefinitions = createSubtaskDefinitions;
exports.createChunkedTask = createChunkedTask;
exports.getReadySubtasks = getReadySubtasks;
exports.isChunkedTaskComplete = isChunkedTaskComplete;
exports.hasFailedSubtask = hasFailedSubtask;
exports.aggregateResults = aggregateResults;
// ============================================================================
// Default Configuration
// ============================================================================
/**
 * Default task chunking configuration
 * Per spec/26_TASK_CHUNKING.md Section 10.1
 */
exports.DEFAULT_TASK_CHUNKING_CONFIG = {
    enabled: true,
    auto_detect: true,
    min_subtasks: 2,
    max_subtasks: 10,
    execution_mode: 'auto',
    retry: {
        max_retries: 2,
        retry_delay_ms: 2000,
        backoff_multiplier: 1.5,
        retry_on: ['INCOMPLETE', 'ERROR', 'TIMEOUT'],
    },
    fail_fast: false,
    review_loop_per_subtask: true,
};
// ============================================================================
// Task Analysis Functions
// ============================================================================
/**
 * Analyze a task to determine if it should be decomposed
 * Per spec/26_TASK_CHUNKING.md Section 2.2
 *
 * Criteria:
 * - Multiple files: Task requires creating/modifying multiple files
 * - Independent parts: Task has independent executable parts
 * - Explicit enumeration: Task lists items like "A, B, C"
 * - Large scope: Task scope is large (5+ functions, etc.)
 */
function analyzeTaskForChunking(prompt, config = exports.DEFAULT_TASK_CHUNKING_CONFIG) {
    if (!config.enabled || !config.auto_detect) {
        return {
            is_decomposable: false,
            reason: 'Task chunking disabled or auto-detect disabled',
        };
    }
    // Check for explicit enumeration (comma-separated items, numbered list)
    const enumerationPattern = /(?:^|\n)\s*(?:\d+\.\s+|\*\s+|-\s+|[a-z]\)\s+)/gim;
    const commaListPattern = /(?:create|implement|add|build|make|write)\s+(?:\w+(?:,\s*\w+){2,})/gi;
    const andListPattern = /(?:\w+(?:,\s*\w+)+\s+and\s+\w+)/gi;
    const hasEnumeration = enumerationPattern.test(prompt);
    const hasCommaList = commaListPattern.test(prompt);
    const hasAndList = andListPattern.test(prompt);
    // Check for multiple file indicators
    const multipleFilesPattern = /(?:files?|components?|modules?|functions?|classes?)\s*(?:for|:)/gi;
    const hasMultipleFiles = multipleFilesPattern.test(prompt);
    // Check for independent parts indicators
    const independentPartsPattern = /(?:independently|separately|each|respectively)/gi;
    const hasIndependentParts = independentPartsPattern.test(prompt);
    // Check for large scope indicators
    const largeScopeKeywords = ['system', 'module', 'complete', 'full', 'entire', 'all'];
    const hasLargeScope = largeScopeKeywords.some(keyword => prompt.toLowerCase().includes(keyword));
    // Determine if decomposable
    const indicators = [
        hasEnumeration,
        hasCommaList,
        hasAndList,
        hasMultipleFiles,
        hasIndependentParts,
        hasLargeScope,
    ];
    const positiveIndicators = indicators.filter(Boolean).length;
    if (positiveIndicators >= 2) {
        // Extract suggested subtasks from enumeration
        const subtasks = extractSubtasksFromPrompt(prompt);
        if (subtasks.length >= config.min_subtasks && subtasks.length <= config.max_subtasks) {
            // Determine execution mode
            const hasDependencies = detectDependencies(subtasks);
            const execution_mode = config.execution_mode === 'auto'
                ? (hasDependencies ? 'sequential' : 'parallel')
                : config.execution_mode;
            return {
                is_decomposable: true,
                reason: buildDecompositionReason(indicators),
                suggested_subtasks: subtasks,
                execution_mode,
            };
        }
    }
    return {
        is_decomposable: false,
        reason: 'Task does not meet decomposition criteria',
    };
}
/**
 * Extract subtasks from a prompt
 */
function extractSubtasksFromPrompt(prompt) {
    const subtasks = [];
    // Try to extract numbered list items
    const numberedPattern = /(?:^|\n)\s*(\d+)\.\s+(.+?)(?=\n\s*\d+\.|$)/gs;
    let match;
    while ((match = numberedPattern.exec(prompt)) !== null) {
        subtasks.push({
            prompt: match[2].trim(),
            dependencies: [],
            execution_order: parseInt(match[1], 10),
        });
    }
    if (subtasks.length > 0) {
        return subtasks;
    }
    // Try to extract bullet list items
    const bulletPattern = /(?:^|\n)\s*[-*]\s+(.+?)(?=\n\s*[-*]|$)/gs;
    let order = 1;
    while ((match = bulletPattern.exec(prompt)) !== null) {
        subtasks.push({
            prompt: match[1].trim(),
            dependencies: [],
            execution_order: order++,
        });
    }
    if (subtasks.length > 0) {
        return subtasks;
    }
    // Try to extract comma-separated items
    const commaPattern = /(?:create|implement|add|build)\s+(.+?)(?:\.|$)/gi;
    match = commaPattern.exec(prompt);
    if (match) {
        const items = match[1].split(/,\s*(?:and\s+)?/);
        return items.map((item, idx) => ({
            prompt: `${match[0].split(' ')[0]} ${item.trim()}`,
            dependencies: [],
            execution_order: idx + 1,
        }));
    }
    return subtasks;
}
/**
 * Detect if subtasks have dependencies
 */
function detectDependencies(subtasks) {
    // Check for dependency keywords
    const dependencyKeywords = ['after', 'then', 'once', 'following', 'based on', 'using'];
    for (const subtask of subtasks) {
        if (dependencyKeywords.some(keyword => subtask.prompt.toLowerCase().includes(keyword))) {
            return true;
        }
    }
    return false;
}
/**
 * Build decomposition reason string
 */
function buildDecompositionReason(indicators) {
    const reasons = [];
    const labels = [
        'enumeration detected',
        'comma-separated list',
        'and-list pattern',
        'multiple files indicator',
        'independent parts',
        'large scope',
    ];
    indicators.forEach((indicator, idx) => {
        if (indicator) {
            reasons.push(labels[idx]);
        }
    });
    return `Decomposable: ${reasons.join(', ')}`;
}
// ============================================================================
// Retry Logic
// ============================================================================
/**
 * Calculate retry delay with exponential backoff
 * Per spec/26_TASK_CHUNKING.md Section 5.2
 */
function calculateRetryDelay(retryCount, config) {
    return config.retry_delay_ms * Math.pow(config.backoff_multiplier, retryCount);
}
/**
 * Determine if a subtask should be retried
 * Per spec/26_TASK_CHUNKING.md Section 5
 */
function shouldRetry(result, retryCount, config) {
    if (retryCount >= config.max_retries) {
        return false;
    }
    if (result.status === 'INCOMPLETE' && config.retry_on.includes('INCOMPLETE')) {
        return true;
    }
    if (result.status === 'ERROR' && config.retry_on.includes('ERROR')) {
        return true;
    }
    return false;
}
// ============================================================================
// Utility Functions
// ============================================================================
/**
 * Generate a unique subtask ID
 */
function generateSubtaskId(parentTaskId, index) {
    return `${parentTaskId}-sub-${index}`;
}
/**
 * Create initial subtask definitions from analysis
 */
function createSubtaskDefinitions(parentTaskId, analysis) {
    if (!analysis.suggested_subtasks) {
        return [];
    }
    return analysis.suggested_subtasks.map((subtask, index) => ({
        subtask_id: generateSubtaskId(parentTaskId, index + 1),
        parent_task_id: parentTaskId,
        prompt: subtask.prompt,
        dependencies: subtask.dependencies,
        status: 'PENDING',
        retry_count: 0,
        execution_order: subtask.execution_order,
    }));
}
/**
 * Create a ChunkedTask from analysis
 */
function createChunkedTask(parentTaskId, analysis, config) {
    const subtasks = createSubtaskDefinitions(parentTaskId, analysis);
    return {
        parent_task_id: parentTaskId,
        subtasks,
        execution_mode: analysis.execution_mode ?? config.execution_mode,
        aggregation_strategy: {
            type: 'merge_all',
            conflict_resolution: 'overwrite',
        },
        status: 'EXECUTING',
        started_at: new Date().toISOString(),
    };
}
/**
 * Get subtasks that are ready to execute (dependencies satisfied)
 */
function getReadySubtasks(chunkedTask) {
    return chunkedTask.subtasks.filter(subtask => {
        if (subtask.status !== 'PENDING') {
            return false;
        }
        // Check if all dependencies are complete
        for (const depId of subtask.dependencies) {
            const dep = chunkedTask.subtasks.find(s => s.subtask_id === depId);
            if (!dep || dep.status !== 'COMPLETE') {
                return false;
            }
        }
        return true;
    });
}
/**
 * Check if all subtasks are complete
 */
function isChunkedTaskComplete(chunkedTask) {
    return chunkedTask.subtasks.every(s => s.status === 'COMPLETE');
}
/**
 * Check if any subtask failed (after retries)
 */
function hasFailedSubtask(chunkedTask) {
    return chunkedTask.subtasks.some(s => s.status === 'FAILED');
}
/**
 * Aggregate results from all subtasks
 */
function aggregateResults(chunkedTask) {
    const files_modified = [];
    const outputs = [];
    let total_review_loop_iterations = 0;
    for (const subtask of chunkedTask.subtasks) {
        if (subtask.result) {
            files_modified.push(...subtask.result.files_modified);
            outputs.push(subtask.result.output_summary);
            total_review_loop_iterations += subtask.result.review_loop_iterations ?? 0;
        }
    }
    // Remove duplicates from files
    const uniqueFiles = [...new Set(files_modified)];
    return {
        files_modified: uniqueFiles,
        output_summary: outputs.join('\n\n'),
        total_review_loop_iterations,
    };
}
// ============================================================================
// Task Chunking Executor Wrapper
// ============================================================================
/**
 * TaskChunkingExecutorWrapper
 *
 * Wraps an IExecutor to add automatic task chunking functionality.
 * Per spec/26_TASK_CHUNKING.md
 *
 * Features:
 * - Analyzes tasks for decomposition
 * - Executes subtasks in parallel or sequential mode
 * - Auto-retries failed subtasks with exponential backoff
 * - Aggregates results from all subtasks
 * - Emits chunking events for logging
 */
class TaskChunkingExecutorWrapper {
    executor;
    config;
    onEvent;
    // Per spec/28_CONVERSATION_TRACE.md Section 4.2: ConversationTracer for CHUNKING_PLAN logging
    conversationTracer;
    constructor(executor, config = {}, onEvent, conversationTracer) {
        this.executor = executor;
        this.config = { ...exports.DEFAULT_TASK_CHUNKING_CONFIG, ...config };
        this.onEvent = onEvent;
        this.conversationTracer = conversationTracer;
    }
    /**
     * Execute a task with automatic chunking
     */
    async execute(task) {
        const { id, prompt, workingDir } = task;
        const parentTaskId = id || `task-${Date.now()}`;
        const startTime = Date.now();
        // Emit chunking start event
        this.emitEvent('CHUNKING_START', {
            parent_task_id: parentTaskId,
            original_prompt: prompt,
            analysis_started: true,
        });
        // Analyze task for chunking
        const analysis = analyzeTaskForChunking(prompt, this.config);
        // Emit analysis event
        this.emitEvent('CHUNKING_ANALYSIS', {
            parent_task_id: parentTaskId,
            is_decomposable: analysis.is_decomposable,
            decomposition_reason: analysis.reason,
            subtask_count: analysis.suggested_subtasks?.length ?? 0,
            dependencies_detected: analysis.execution_mode === 'sequential',
        });
        // If not decomposable, execute as single task
        if (!analysis.is_decomposable) {
            const result = await this.executor.execute(task);
            const endTime = Date.now();
            this.emitEvent('CHUNKING_COMPLETE', {
                parent_task_id: parentTaskId,
                total_subtasks: 0,
                completed_subtasks: 0,
                failed_subtasks: 0,
                total_retries: 0,
                total_duration_ms: endTime - startTime,
                chunking_skipped: true,
            });
            return result;
        }
        // Create chunked task
        const chunkedTask = createChunkedTask(parentTaskId, analysis, this.config);
        // Emit subtask created events
        for (const subtask of chunkedTask.subtasks) {
            this.emitEvent('SUBTASK_CREATED', {
                parent_task_id: parentTaskId,
                subtask_id: subtask.subtask_id,
                prompt: subtask.prompt,
                dependencies: subtask.dependencies,
                execution_order: subtask.execution_order,
            });
        }
        // Per spec/28_CONVERSATION_TRACE.md Section 4.2: Log CHUNKING_PLAN
        if (this.conversationTracer) {
            const subtaskPlans = chunkedTask.subtasks.map(subtask => ({
                id: subtask.subtask_id,
                description: subtask.prompt,
                dependencies: subtask.dependencies,
            }));
            this.conversationTracer.logChunkingPlan(subtaskPlans);
        }
        // Execute subtasks
        if (chunkedTask.execution_mode === 'parallel') {
            await this.executeParallel(chunkedTask, workingDir);
        }
        else {
            await this.executeSequential(chunkedTask, workingDir);
        }
        // Determine final status
        const endTime = Date.now();
        const completedCount = chunkedTask.subtasks.filter(s => s.status === 'COMPLETE').length;
        const failedCount = chunkedTask.subtasks.filter(s => s.status === 'FAILED').length;
        const totalRetries = chunkedTask.subtasks.reduce((sum, s) => sum + s.retry_count, 0);
        if (hasFailedSubtask(chunkedTask)) {
            chunkedTask.status = this.config.fail_fast ? 'FAILED' : 'COMPLETE';
        }
        else {
            chunkedTask.status = 'COMPLETE';
        }
        chunkedTask.ended_at = new Date().toISOString();
        // Aggregate results
        const aggregated = aggregateResults(chunkedTask);
        // Emit aggregation event
        this.emitEvent('CHUNKING_AGGREGATION', {
            parent_task_id: parentTaskId,
            aggregation_strategy: chunkedTask.aggregation_strategy.type,
            conflict_resolution: chunkedTask.aggregation_strategy.conflict_resolution,
            aggregation_result: {
                total_files_modified: aggregated.files_modified,
                conflicts_detected: false,
            },
        });
        // Emit chunking complete event
        this.emitEvent('CHUNKING_COMPLETE', {
            parent_task_id: parentTaskId,
            total_subtasks: chunkedTask.subtasks.length,
            completed_subtasks: completedCount,
            failed_subtasks: failedCount,
            total_retries: totalRetries,
            total_duration_ms: endTime - startTime,
        });
        // Build final result
        const finalStatus = chunkedTask.status === 'COMPLETE' && failedCount === 0
            ? 'COMPLETE'
            : (this.config.fail_fast ? 'ERROR' : 'INCOMPLETE');
        // Convert files_modified to VerifiedFile[]
        const verifiedFiles = aggregated.files_modified.map(filePath => ({
            path: filePath,
            exists: true, // Assumed to exist if modified
        }));
        return {
            executed: true,
            output: aggregated.output_summary,
            files_modified: aggregated.files_modified,
            duration_ms: endTime - startTime,
            status: finalStatus,
            cwd: workingDir,
            verified_files: verifiedFiles,
            unverified_files: [],
        };
    }
    /**
     * Check if Claude Code CLI is available
     * Delegates to wrapped executor
     */
    async isClaudeCodeAvailable() {
        return this.executor.isClaudeCodeAvailable();
    }
    /**
     * Check authentication status
     * Delegates to wrapped executor
     */
    async checkAuthStatus() {
        return this.executor.checkAuthStatus();
    }
    /**
     * Execute subtasks in parallel
     */
    async executeParallel(chunkedTask, cwd) {
        const pendingSubtasks = chunkedTask.subtasks.filter(s => s.status === 'PENDING');
        // Execute all pending subtasks in parallel
        await Promise.all(pendingSubtasks.map(subtask => this.executeSubtask(subtask, chunkedTask, cwd)));
    }
    /**
     * Execute subtasks sequentially
     */
    async executeSequential(chunkedTask, cwd) {
        // Sort by execution order
        const sortedSubtasks = [...chunkedTask.subtasks].sort((a, b) => (a.execution_order ?? 0) - (b.execution_order ?? 0));
        for (const subtask of sortedSubtasks) {
            if (subtask.status !== 'PENDING') {
                continue;
            }
            // Check dependencies
            const depsComplete = subtask.dependencies.every(depId => {
                const dep = chunkedTask.subtasks.find(s => s.subtask_id === depId);
                return dep?.status === 'COMPLETE';
            });
            if (!depsComplete) {
                subtask.status = 'FAILED';
                subtask.result = {
                    status: 'ERROR',
                    output_summary: 'Dependencies not satisfied',
                    files_modified: [],
                };
                continue;
            }
            await this.executeSubtask(subtask, chunkedTask, cwd);
            // Check fail_fast - re-read status as executeSubtask modifies it
            // Type assertion needed because TypeScript's control flow analysis
            // doesn't know executeSubtask mutates the status property
            if (this.config.fail_fast && subtask.status === 'FAILED') {
                break;
            }
        }
    }
    /**
     * Execute a single subtask with retry logic
     */
    async executeSubtask(subtask, _chunkedTask, cwd) {
        subtask.status = 'RUNNING';
        // Emit subtask start event
        this.emitEvent('SUBTASK_START', {
            parent_task_id: subtask.parent_task_id,
            subtask_id: subtask.subtask_id,
            prompt: subtask.prompt,
            retry_count: subtask.retry_count,
        });
        try {
            const result = await this.executor.execute({
                id: subtask.subtask_id,
                prompt: subtask.prompt,
                workingDir: cwd,
            });
            // Convert executor result to subtask result
            const subtaskResult = {
                status: result.status === 'COMPLETE' ? 'COMPLETE' : 'INCOMPLETE',
                output_summary: result.output || '',
                files_modified: result.files_modified || [],
                review_loop_iterations: 1, // Will be updated if Review Loop is integrated
            };
            subtask.result = subtaskResult;
            // Check if retry needed
            if (subtaskResult.status !== 'COMPLETE' && shouldRetry(subtaskResult, subtask.retry_count, this.config.retry)) {
                subtask.retry_count++;
                subtask.status = 'RETRYING';
                // Emit retry event
                this.emitEvent('SUBTASK_RETRY', {
                    parent_task_id: subtask.parent_task_id,
                    subtask_id: subtask.subtask_id,
                    retry_count: subtask.retry_count,
                    failure_reason: 'Incomplete result',
                });
                // Wait with backoff
                const delay = calculateRetryDelay(subtask.retry_count - 1, this.config.retry);
                await new Promise(resolve => setTimeout(resolve, delay));
                // Recursively retry
                await this.executeSubtask(subtask, _chunkedTask, cwd);
                return;
            }
            // Mark final status
            if (subtaskResult.status === 'COMPLETE') {
                subtask.status = 'COMPLETE';
                // Emit complete event
                this.emitEvent('SUBTASK_COMPLETE', {
                    parent_task_id: subtask.parent_task_id,
                    subtask_id: subtask.subtask_id,
                    subtask_result: subtaskResult,
                });
            }
            else {
                subtask.status = 'FAILED';
                // Emit failed event
                this.emitEvent('SUBTASK_FAILED', {
                    parent_task_id: subtask.parent_task_id,
                    subtask_id: subtask.subtask_id,
                    failure_reason: 'Max retries exceeded',
                    retry_count: subtask.retry_count,
                });
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            subtask.result = {
                status: 'ERROR',
                output_summary: errorMessage,
                files_modified: [],
            };
            // Check if retry needed for error
            if (shouldRetry(subtask.result, subtask.retry_count, this.config.retry)) {
                subtask.retry_count++;
                subtask.status = 'RETRYING';
                // Emit retry event
                this.emitEvent('SUBTASK_RETRY', {
                    parent_task_id: subtask.parent_task_id,
                    subtask_id: subtask.subtask_id,
                    retry_count: subtask.retry_count,
                    failure_reason: errorMessage,
                });
                // Wait with backoff
                const delay = calculateRetryDelay(subtask.retry_count - 1, this.config.retry);
                await new Promise(resolve => setTimeout(resolve, delay));
                // Recursively retry
                await this.executeSubtask(subtask, _chunkedTask, cwd);
                return;
            }
            subtask.status = 'FAILED';
            // Emit failed event
            this.emitEvent('SUBTASK_FAILED', {
                parent_task_id: subtask.parent_task_id,
                subtask_id: subtask.subtask_id,
                failure_reason: errorMessage,
                retry_count: subtask.retry_count,
            });
        }
    }
    /**
     * Emit a chunking event
     */
    emitEvent(eventType, content) {
        if (this.onEvent) {
            this.onEvent(eventType, content);
        }
    }
}
exports.TaskChunkingExecutorWrapper = TaskChunkingExecutorWrapper;
//# sourceMappingURL=task-chunking.js.map