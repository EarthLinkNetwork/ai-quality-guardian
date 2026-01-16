"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResourceLimitManager = exports.ResourceLimitError = void 0;
const supporting_1 = require("../models/supporting");
const error_codes_1 = require("../errors/error-codes");
/**
 * Resource Limit Manager Error
 */
class ResourceLimitError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message || (0, error_codes_1.getErrorMessage)(code));
        this.name = 'ResourceLimitError';
        this.code = code;
        this.details = details;
    }
}
exports.ResourceLimitError = ResourceLimitError;
/**
 * Valid ranges for limits
 */
const LIMIT_RANGES = {
    max_files: { min: 1, max: 20 },
    max_tests: { min: 1, max: 50 },
    max_seconds: { min: 30, max: 900 },
    subagents: { min: 1, max: 9 },
    executors: { min: 1, max: 4 },
};
/**
 * Default limits
 */
const DEFAULT_LIMITS = {
    max_files: 5,
    max_tests: 10,
    max_seconds: 300,
};
/**
 * Default parallel limits
 */
const DEFAULT_PARALLEL_LIMITS = {
    subagents: 9,
    executors: 4,
};
/**
 * Resource Limit Manager class
 */
class ResourceLimitManager {
    limits;
    parallelLimits;
    fileCount;
    testCount;
    startTime;
    elapsedOverride;
    violations;
    activeSubagents;
    activeExecutors;
    /**
     * Create a new ResourceLimitManager
     */
    constructor() {
        this.limits = { ...DEFAULT_LIMITS };
        this.parallelLimits = { ...DEFAULT_PARALLEL_LIMITS };
        this.fileCount = 0;
        this.testCount = 0;
        this.startTime = null;
        this.elapsedOverride = null;
        this.violations = [];
        this.activeSubagents = new Set();
        this.activeExecutors = new Set();
    }
    /**
     * Get default limits
     */
    getDefaultLimits() {
        return { ...DEFAULT_LIMITS };
    }
    /**
     * Get parallel limits
     */
    getParallelLimits() {
        return { ...this.parallelLimits };
    }
    /**
     * Set task limits with validation
     * @throws ResourceLimitError if limits are out of valid range
     */
    setLimits(limits) {
        // Validate max_files
        if (limits.max_files < LIMIT_RANGES.max_files.min || limits.max_files > LIMIT_RANGES.max_files.max) {
            throw new ResourceLimitError(error_codes_1.ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED, `max_files must be between ${LIMIT_RANGES.max_files.min} and ${LIMIT_RANGES.max_files.max}`, { max_files: limits.max_files, range: LIMIT_RANGES.max_files });
        }
        // Validate max_tests
        if (limits.max_tests < LIMIT_RANGES.max_tests.min || limits.max_tests > LIMIT_RANGES.max_tests.max) {
            throw new ResourceLimitError(error_codes_1.ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED, `max_tests must be between ${LIMIT_RANGES.max_tests.min} and ${LIMIT_RANGES.max_tests.max}`, { max_tests: limits.max_tests, range: LIMIT_RANGES.max_tests });
        }
        // Validate max_seconds
        if (limits.max_seconds < LIMIT_RANGES.max_seconds.min || limits.max_seconds > LIMIT_RANGES.max_seconds.max) {
            throw new ResourceLimitError(error_codes_1.ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED, `max_seconds must be between ${LIMIT_RANGES.max_seconds.min} and ${LIMIT_RANGES.max_seconds.max}`, { max_seconds: limits.max_seconds, range: LIMIT_RANGES.max_seconds });
        }
        this.limits = { ...limits };
    }
    /**
     * Set parallel limits with validation
     * @throws ResourceLimitError if limits are out of valid range
     */
    setParallelLimits(limits) {
        // Validate subagents
        if (limits.subagents > LIMIT_RANGES.subagents.max) {
            throw new ResourceLimitError(error_codes_1.ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED, `subagents must be at most ${LIMIT_RANGES.subagents.max}`, { subagents: limits.subagents, max: LIMIT_RANGES.subagents.max });
        }
        // Validate executors
        if (limits.executors > LIMIT_RANGES.executors.max) {
            throw new ResourceLimitError(error_codes_1.ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED, `executors must be at most ${LIMIT_RANGES.executors.max}`, { executors: limits.executors, max: LIMIT_RANGES.executors.max });
        }
        this.parallelLimits = { ...limits };
    }
    /**
     * Record a file operation
     */
    recordFileOperation(_filePath) {
        this.fileCount++;
    }
    /**
     * Record a test execution
     */
    recordTestExecution(_testId) {
        this.testCount++;
    }
    /**
     * Start the timer
     */
    startTimer() {
        this.startTime = Date.now();
        this.elapsedOverride = null;
    }
    /**
     * Get elapsed seconds
     */
    getElapsedSeconds() {
        if (this.elapsedOverride !== null) {
            return this.elapsedOverride;
        }
        if (this.startTime === null) {
            return 0;
        }
        return Math.floor((Date.now() - this.startTime) / 1000);
    }
    /**
     * Set elapsed time for testing purposes
     */
    setElapsedForTesting(seconds) {
        this.elapsedOverride = seconds;
    }
    /**
     * Get file count
     */
    getFileCount() {
        return this.fileCount;
    }
    /**
     * Get test count
     */
    getTestCount() {
        return this.testCount;
    }
    /**
     * Check if file count is exceeded
     */
    isFileCountExceeded() {
        return this.fileCount > this.limits.max_files;
    }
    /**
     * Check if test count is exceeded
     */
    isTestCountExceeded() {
        return this.testCount > this.limits.max_tests;
    }
    /**
     * Check if time is exceeded
     */
    isTimeExceeded() {
        return this.getElapsedSeconds() > this.limits.max_seconds;
    }
    /**
     * Enforce file limit (fail-closed)
     * @throws ResourceLimitError if limit would be exceeded
     */
    enforceFileLimit(_filePath) {
        if (this.fileCount >= this.limits.max_files) {
            throw new ResourceLimitError(error_codes_1.ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED, `File limit exceeded: ${this.fileCount + 1} > ${this.limits.max_files}`, { fileCount: this.fileCount + 1, limit: this.limits.max_files });
        }
    }
    /**
     * Enforce test limit (fail-closed)
     * @throws ResourceLimitError if limit would be exceeded
     */
    enforceTestLimit(_testId) {
        if (this.testCount >= this.limits.max_tests) {
            throw new ResourceLimitError(error_codes_1.ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED, `Test limit exceeded: ${this.testCount + 1} > ${this.limits.max_tests}`, { testCount: this.testCount + 1, limit: this.limits.max_tests });
        }
    }
    /**
     * Enforce time limit (fail-closed)
     * @throws ResourceLimitError if limit is exceeded
     */
    enforceTimeLimit() {
        const elapsed = this.getElapsedSeconds();
        if (elapsed > this.limits.max_seconds) {
            throw new ResourceLimitError(error_codes_1.ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED, `Time limit exceeded: ${elapsed} > ${this.limits.max_seconds}`, { elapsed, limit: this.limits.max_seconds });
        }
    }
    /**
     * Check and record file operation (fail-closed)
     */
    checkAndRecordFileOperation(filePath) {
        const newCount = this.fileCount + 1;
        if (newCount > this.limits.max_files) {
            const violation = (0, supporting_1.createLimitViolation)('max_files', this.limits.max_files, newCount);
            this.violations.push(violation);
            return {
                allowed: false,
                violation,
            };
        }
        this.recordFileOperation(filePath);
        return { allowed: true };
    }
    /**
     * Check and record test execution (fail-closed)
     */
    checkAndRecordTestExecution(testId) {
        const newCount = this.testCount + 1;
        if (newCount > this.limits.max_tests) {
            const violation = (0, supporting_1.createLimitViolation)('max_tests', this.limits.max_tests, newCount);
            this.violations.push(violation);
            return {
                allowed: false,
                violation,
            };
        }
        this.recordTestExecution(testId);
        return { allowed: true };
    }
    /**
     * Check time limit
     */
    checkTimeLimit() {
        const elapsed = this.getElapsedSeconds();
        if (elapsed > this.limits.max_seconds) {
            const violation = (0, supporting_1.createLimitViolation)('max_seconds', this.limits.max_seconds, elapsed);
            this.violations.push(violation);
            return {
                allowed: false,
                violation,
            };
        }
        return { allowed: true };
    }
    /**
     * Suggest chunk size based on remaining capacity
     */
    suggestChunkSize(totalFiles) {
        const remaining = this.getRemainingFileCapacity();
        if (remaining <= 0) {
            return 0;
        }
        return Math.min(remaining, totalFiles);
    }
    /**
     * Get remaining file capacity
     */
    getRemainingFileCapacity() {
        return Math.max(0, this.limits.max_files - this.fileCount);
    }
    /**
     * Start a subagent
     * @throws ResourceLimitError if limit would be exceeded
     */
    startSubagent(subagentId) {
        if (this.activeSubagents.size >= this.parallelLimits.subagents) {
            throw new ResourceLimitError(error_codes_1.ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED, `Subagent limit exceeded: ${this.activeSubagents.size + 1} > ${this.parallelLimits.subagents}`, { activeCount: this.activeSubagents.size, limit: this.parallelLimits.subagents });
        }
        this.activeSubagents.add(subagentId);
    }
    /**
     * End a subagent
     */
    endSubagent(subagentId) {
        this.activeSubagents.delete(subagentId);
    }
    /**
     * Start an executor
     * @throws ResourceLimitError if limit would be exceeded
     */
    startExecutor(executorId) {
        if (this.activeExecutors.size >= this.parallelLimits.executors) {
            throw new ResourceLimitError(error_codes_1.ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED, `Executor limit exceeded: ${this.activeExecutors.size + 1} > ${this.parallelLimits.executors}`, { activeCount: this.activeExecutors.size, limit: this.parallelLimits.executors });
        }
        this.activeExecutors.add(executorId);
    }
    /**
     * Get active subagent count
     */
    getActiveSubagentCount() {
        return this.activeSubagents.size;
    }
    /**
     * Get active executor count
     */
    getActiveExecutorCount() {
        return this.activeExecutors.size;
    }
    /**
     * Check if subagent limit is exceeded
     */
    isSubagentLimitExceeded() {
        return this.activeSubagents.size >= this.parallelLimits.subagents;
    }
    /**
     * Get all violations
     */
    getAllViolations() {
        // Also check current state for any violations not yet recorded
        const currentViolations = [...this.violations];
        if (this.isFileCountExceeded() && !currentViolations.some(v => v.limit_type === 'max_files')) {
            currentViolations.push((0, supporting_1.createLimitViolation)('max_files', this.limits.max_files, this.fileCount));
        }
        if (this.isTestCountExceeded() && !currentViolations.some(v => v.limit_type === 'max_tests')) {
            currentViolations.push((0, supporting_1.createLimitViolation)('max_tests', this.limits.max_tests, this.testCount));
        }
        return currentViolations;
    }
    /**
     * Reset counters for new task
     */
    reset() {
        this.fileCount = 0;
        this.testCount = 0;
        this.startTime = null;
        this.elapsedOverride = null;
        this.violations = [];
        this.activeSubagents.clear();
        this.activeExecutors.clear();
    }
    /**
     * Get usage statistics
     */
    getUsageStatistics() {
        const elapsed = this.getElapsedSeconds();
        return {
            files_used: this.fileCount,
            files_limit: this.limits.max_files,
            files_remaining: Math.max(0, this.limits.max_files - this.fileCount),
            tests_used: this.testCount,
            tests_limit: this.limits.max_tests,
            tests_remaining: Math.max(0, this.limits.max_tests - this.testCount),
            seconds_elapsed: elapsed,
            seconds_limit: this.limits.max_seconds,
            seconds_remaining: Math.max(0, this.limits.max_seconds - elapsed),
        };
    }
}
exports.ResourceLimitManager = ResourceLimitManager;
//# sourceMappingURL=resource-limit-manager.js.map