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
import type { IExecutor, ExecutorResult, ExecutorTask, AuthCheckResult } from '../executor/claude-code-executor';
import type { LogEventType } from '../models/repl/task-log';
import type { ConversationTracer } from '../trace/conversation-tracer';
/**
 * Chunked task status
 * Per spec/26_TASK_CHUNKING.md Section 3.1
 */
export type ChunkedTaskStatus = 'ANALYZING' | 'EXECUTING' | 'AGGREGATING' | 'COMPLETE' | 'FAILED';
/**
 * Subtask status
 * Per spec/26_TASK_CHUNKING.md Section 3.1
 */
export type SubtaskStatus = 'PENDING' | 'RUNNING' | 'COMPLETE' | 'FAILED' | 'RETRYING';
/**
 * Retry conditions
 * Per spec/26_TASK_CHUNKING.md Section 5.1
 */
export type RetryCondition = 'INCOMPLETE' | 'ERROR' | 'TIMEOUT';
/**
 * Subtask result
 * Per spec/26_TASK_CHUNKING.md Section 3.1
 */
export interface SubtaskResult {
    status: 'COMPLETE' | 'INCOMPLETE' | 'ERROR';
    output_summary: string;
    files_modified: string[];
    review_loop_iterations?: number;
}
/**
 * Subtask definition
 * Per spec/26_TASK_CHUNKING.md Section 3.1
 */
export interface SubtaskDefinition {
    subtask_id: string;
    parent_task_id: string;
    prompt: string;
    dependencies: string[];
    status: SubtaskStatus;
    retry_count: number;
    worker_id?: string;
    result?: SubtaskResult;
    execution_order?: number;
}
/**
 * Aggregation strategy
 * Per spec/26_TASK_CHUNKING.md Section 3.2
 */
export interface AggregationStrategy {
    type: 'merge_all' | 'last_wins' | 'custom';
    conflict_resolution?: 'fail' | 'overwrite' | 'manual';
}
/**
 * Chunked task
 * Per spec/26_TASK_CHUNKING.md Section 3.1
 */
export interface ChunkedTask {
    parent_task_id: string;
    subtasks: SubtaskDefinition[];
    execution_mode: 'parallel' | 'sequential';
    aggregation_strategy: AggregationStrategy;
    status: ChunkedTaskStatus;
    started_at: string;
    ended_at?: string;
}
/**
 * Retry configuration
 * Per spec/26_TASK_CHUNKING.md Section 5.1
 */
export interface RetryConfig {
    max_retries: number;
    retry_delay_ms: number;
    backoff_multiplier: number;
    retry_on: RetryCondition[];
}
/**
 * Task chunking configuration
 * Per spec/26_TASK_CHUNKING.md Section 10.1
 */
export interface TaskChunkingConfig {
    enabled: boolean;
    auto_detect: boolean;
    min_subtasks: number;
    max_subtasks: number;
    execution_mode: 'parallel' | 'sequential' | 'auto';
    retry: RetryConfig;
    fail_fast: boolean;
    review_loop_per_subtask: boolean;
}
/**
 * Task analysis result
 * Per spec/26_TASK_CHUNKING.md Section 2.2
 */
export interface TaskAnalysisResult {
    is_decomposable: boolean;
    reason: string;
    suggested_subtasks?: Array<{
        prompt: string;
        dependencies: string[];
        execution_order: number;
    }>;
    execution_mode?: 'parallel' | 'sequential';
}
/**
 * Chunking event callback type
 */
export type ChunkingEventCallback = (eventType: LogEventType, content: Record<string, unknown>) => void;
/**
 * Chunking result
 */
export interface ChunkingResult {
    parent_task_id: string;
    status: ChunkedTaskStatus;
    total_subtasks: number;
    completed_subtasks: number;
    failed_subtasks: number;
    total_retries: number;
    total_duration_ms: number;
    files_modified: string[];
    chunking_skipped: boolean;
    final_output: string;
}
/**
 * Default task chunking configuration
 * Per spec/26_TASK_CHUNKING.md Section 10.1
 */
export declare const DEFAULT_TASK_CHUNKING_CONFIG: TaskChunkingConfig;
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
export declare function analyzeTaskForChunking(prompt: string, config?: TaskChunkingConfig): TaskAnalysisResult;
/**
 * Calculate retry delay with exponential backoff
 * Per spec/26_TASK_CHUNKING.md Section 5.2
 */
export declare function calculateRetryDelay(retryCount: number, config: RetryConfig): number;
/**
 * Determine if a subtask should be retried
 * Per spec/26_TASK_CHUNKING.md Section 5
 */
export declare function shouldRetry(result: SubtaskResult, retryCount: number, config: RetryConfig): boolean;
/**
 * Generate a unique subtask ID
 */
export declare function generateSubtaskId(parentTaskId: string, index: number): string;
/**
 * Create initial subtask definitions from analysis
 */
export declare function createSubtaskDefinitions(parentTaskId: string, analysis: TaskAnalysisResult): SubtaskDefinition[];
/**
 * Create a ChunkedTask from analysis
 */
export declare function createChunkedTask(parentTaskId: string, analysis: TaskAnalysisResult, config: TaskChunkingConfig): ChunkedTask;
/**
 * Get subtasks that are ready to execute (dependencies satisfied)
 */
export declare function getReadySubtasks(chunkedTask: ChunkedTask): SubtaskDefinition[];
/**
 * Check if all subtasks are complete
 */
export declare function isChunkedTaskComplete(chunkedTask: ChunkedTask): boolean;
/**
 * Check if any subtask failed (after retries)
 */
export declare function hasFailedSubtask(chunkedTask: ChunkedTask): boolean;
/**
 * Aggregate results from all subtasks
 */
export declare function aggregateResults(chunkedTask: ChunkedTask): {
    files_modified: string[];
    output_summary: string;
    total_review_loop_iterations: number;
};
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
export declare class TaskChunkingExecutorWrapper implements IExecutor {
    private executor;
    private config;
    private onEvent?;
    private conversationTracer?;
    constructor(executor: IExecutor, config?: Partial<TaskChunkingConfig>, onEvent?: ChunkingEventCallback, conversationTracer?: ConversationTracer);
    /**
     * Execute a task with automatic chunking
     */
    execute(task: ExecutorTask): Promise<ExecutorResult>;
    /**
     * Check if Claude Code CLI is available
     * Delegates to wrapped executor
     */
    isClaudeCodeAvailable(): Promise<boolean>;
    /**
     * Check authentication status
     * Delegates to wrapped executor
     */
    checkAuthStatus(): Promise<AuthCheckResult>;
    /**
     * Execute subtasks in parallel
     */
    private executeParallel;
    /**
     * Execute subtasks sequentially
     */
    private executeSequential;
    /**
     * Execute a single subtask with retry logic
     */
    private executeSubtask;
    /**
     * Emit a chunking event
     */
    private emitEvent;
}
//# sourceMappingURL=task-chunking.d.ts.map