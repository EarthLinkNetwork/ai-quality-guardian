/**
 * Resource Limit Manager
 * Based on 04_COMPONENTS.md L167-177
 *
 * Responsible for:
 * - Safe defaults (max_files=5, max_tests=10, max_seconds=300)
 * - Limit application via measurable proxies
 * - Fail-closed on limit violation
 * - Chunk size adjustment
 * - Parallel limits (subagents=9, executors=4)
 */
import { TaskLimits, LimitViolation } from '../models/supporting';
import { ErrorCode } from '../errors/error-codes';
/**
 * Resource Limit Manager Error
 */
export declare class ResourceLimitError extends Error {
    readonly code: ErrorCode;
    readonly details?: Record<string, unknown>;
    constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>);
}
/**
 * Parallel limits interface
 */
interface ParallelLimits {
    subagents: number;
    executors: number;
}
/**
 * Check result interface
 */
interface CheckResult {
    allowed: boolean;
    violation?: LimitViolation;
}
/**
 * Usage statistics interface
 */
interface UsageStatistics {
    files_used: number;
    files_limit: number;
    files_remaining: number;
    tests_used: number;
    tests_limit: number;
    tests_remaining: number;
    seconds_elapsed: number;
    seconds_limit: number;
    seconds_remaining: number;
}
/**
 * Resource Limit Manager class
 */
export declare class ResourceLimitManager {
    private limits;
    private parallelLimits;
    private fileCount;
    private testCount;
    private startTime;
    private elapsedOverride;
    private violations;
    private activeSubagents;
    private activeExecutors;
    /**
     * Create a new ResourceLimitManager
     */
    constructor();
    /**
     * Get default limits
     */
    getDefaultLimits(): TaskLimits;
    /**
     * Get parallel limits
     */
    getParallelLimits(): ParallelLimits;
    /**
     * Set task limits with validation
     * @throws ResourceLimitError if limits are out of valid range
     */
    setLimits(limits: TaskLimits): void;
    /**
     * Set parallel limits with validation
     * @throws ResourceLimitError if limits are out of valid range
     */
    setParallelLimits(limits: ParallelLimits): void;
    /**
     * Record a file operation
     */
    recordFileOperation(_filePath: string): void;
    /**
     * Record a test execution
     */
    recordTestExecution(_testId: string): void;
    /**
     * Start the timer
     */
    startTimer(): void;
    /**
     * Get elapsed seconds
     */
    getElapsedSeconds(): number;
    /**
     * Set elapsed time for testing purposes
     */
    setElapsedForTesting(seconds: number): void;
    /**
     * Get file count
     */
    getFileCount(): number;
    /**
     * Get test count
     */
    getTestCount(): number;
    /**
     * Check if file count is exceeded
     */
    isFileCountExceeded(): boolean;
    /**
     * Check if test count is exceeded
     */
    isTestCountExceeded(): boolean;
    /**
     * Check if time is exceeded
     */
    isTimeExceeded(): boolean;
    /**
     * Enforce file limit (fail-closed)
     * @throws ResourceLimitError if limit would be exceeded
     */
    enforceFileLimit(_filePath: string): void;
    /**
     * Enforce test limit (fail-closed)
     * @throws ResourceLimitError if limit would be exceeded
     */
    enforceTestLimit(_testId: string): void;
    /**
     * Enforce time limit (fail-closed)
     * @throws ResourceLimitError if limit is exceeded
     */
    enforceTimeLimit(): void;
    /**
     * Check and record file operation (fail-closed)
     */
    checkAndRecordFileOperation(filePath: string): CheckResult;
    /**
     * Check and record test execution (fail-closed)
     */
    checkAndRecordTestExecution(testId: string): CheckResult;
    /**
     * Check time limit
     */
    checkTimeLimit(): CheckResult;
    /**
     * Suggest chunk size based on remaining capacity
     */
    suggestChunkSize(totalFiles: number): number;
    /**
     * Get remaining file capacity
     */
    getRemainingFileCapacity(): number;
    /**
     * Start a subagent
     * @throws ResourceLimitError if limit would be exceeded
     */
    startSubagent(subagentId: string): void;
    /**
     * End a subagent
     */
    endSubagent(subagentId: string): void;
    /**
     * Start an executor
     * @throws ResourceLimitError if limit would be exceeded
     */
    startExecutor(executorId: string): void;
    /**
     * Get active subagent count
     */
    getActiveSubagentCount(): number;
    /**
     * Get active executor count
     */
    getActiveExecutorCount(): number;
    /**
     * Check if subagent limit is exceeded
     */
    isSubagentLimitExceeded(): boolean;
    /**
     * Get all violations
     */
    getAllViolations(): LimitViolation[];
    /**
     * Reset counters for new task
     */
    reset(): void;
    /**
     * Get usage statistics
     */
    getUsageStatistics(): UsageStatistics;
}
export {};
//# sourceMappingURL=resource-limit-manager.d.ts.map