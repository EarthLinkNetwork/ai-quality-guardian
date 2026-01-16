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

import { TaskLimits, LimitViolation, createLimitViolation } from '../models/supporting';
import { ErrorCode, getErrorMessage } from '../errors/error-codes';

/**
 * Resource Limit Manager Error
 */
export class ResourceLimitError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>) {
    super(message || getErrorMessage(code));
    this.name = 'ResourceLimitError';
    this.code = code;
    this.details = details;
  }
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
const DEFAULT_LIMITS: TaskLimits = {
  max_files: 5,
  max_tests: 10,
  max_seconds: 300,
};

/**
 * Default parallel limits
 */
const DEFAULT_PARALLEL_LIMITS: ParallelLimits = {
  subagents: 9,
  executors: 4,
};

/**
 * Resource Limit Manager class
 */
export class ResourceLimitManager {
  private limits: TaskLimits;
  private parallelLimits: ParallelLimits;
  private fileCount: number;
  private testCount: number;
  private startTime: number | null;
  private elapsedOverride: number | null;
  private violations: LimitViolation[];
  private activeSubagents: Set<string>;
  private activeExecutors: Set<string>;

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
  getDefaultLimits(): TaskLimits {
    return { ...DEFAULT_LIMITS };
  }

  /**
   * Get parallel limits
   */
  getParallelLimits(): ParallelLimits {
    return { ...this.parallelLimits };
  }

  /**
   * Set task limits with validation
   * @throws ResourceLimitError if limits are out of valid range
   */
  setLimits(limits: TaskLimits): void {
    // Validate max_files
    if (limits.max_files < LIMIT_RANGES.max_files.min || limits.max_files > LIMIT_RANGES.max_files.max) {
      throw new ResourceLimitError(
        ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED,
        `max_files must be between ${LIMIT_RANGES.max_files.min} and ${LIMIT_RANGES.max_files.max}`,
        { max_files: limits.max_files, range: LIMIT_RANGES.max_files }
      );
    }

    // Validate max_tests
    if (limits.max_tests < LIMIT_RANGES.max_tests.min || limits.max_tests > LIMIT_RANGES.max_tests.max) {
      throw new ResourceLimitError(
        ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED,
        `max_tests must be between ${LIMIT_RANGES.max_tests.min} and ${LIMIT_RANGES.max_tests.max}`,
        { max_tests: limits.max_tests, range: LIMIT_RANGES.max_tests }
      );
    }

    // Validate max_seconds
    if (limits.max_seconds < LIMIT_RANGES.max_seconds.min || limits.max_seconds > LIMIT_RANGES.max_seconds.max) {
      throw new ResourceLimitError(
        ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED,
        `max_seconds must be between ${LIMIT_RANGES.max_seconds.min} and ${LIMIT_RANGES.max_seconds.max}`,
        { max_seconds: limits.max_seconds, range: LIMIT_RANGES.max_seconds }
      );
    }

    this.limits = { ...limits };
  }

  /**
   * Set parallel limits with validation
   * @throws ResourceLimitError if limits are out of valid range
   */
  setParallelLimits(limits: ParallelLimits): void {
    // Validate subagents
    if (limits.subagents > LIMIT_RANGES.subagents.max) {
      throw new ResourceLimitError(
        ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED,
        `subagents must be at most ${LIMIT_RANGES.subagents.max}`,
        { subagents: limits.subagents, max: LIMIT_RANGES.subagents.max }
      );
    }

    // Validate executors
    if (limits.executors > LIMIT_RANGES.executors.max) {
      throw new ResourceLimitError(
        ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED,
        `executors must be at most ${LIMIT_RANGES.executors.max}`,
        { executors: limits.executors, max: LIMIT_RANGES.executors.max }
      );
    }

    this.parallelLimits = { ...limits };
  }

  /**
   * Record a file operation
   */
  recordFileOperation(_filePath: string): void {
    this.fileCount++;
  }

  /**
   * Record a test execution
   */
  recordTestExecution(_testId: string): void {
    this.testCount++;
  }

  /**
   * Start the timer
   */
  startTimer(): void {
    this.startTime = Date.now();
    this.elapsedOverride = null;
  }

  /**
   * Get elapsed seconds
   */
  getElapsedSeconds(): number {
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
  setElapsedForTesting(seconds: number): void {
    this.elapsedOverride = seconds;
  }

  /**
   * Get file count
   */
  getFileCount(): number {
    return this.fileCount;
  }

  /**
   * Get test count
   */
  getTestCount(): number {
    return this.testCount;
  }

  /**
   * Check if file count is exceeded
   */
  isFileCountExceeded(): boolean {
    return this.fileCount > this.limits.max_files;
  }

  /**
   * Check if test count is exceeded
   */
  isTestCountExceeded(): boolean {
    return this.testCount > this.limits.max_tests;
  }

  /**
   * Check if time is exceeded
   */
  isTimeExceeded(): boolean {
    return this.getElapsedSeconds() > this.limits.max_seconds;
  }

  /**
   * Enforce file limit (fail-closed)
   * @throws ResourceLimitError if limit would be exceeded
   */
  enforceFileLimit(_filePath: string): void {
    if (this.fileCount >= this.limits.max_files) {
      throw new ResourceLimitError(
        ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED,
        `File limit exceeded: ${this.fileCount + 1} > ${this.limits.max_files}`,
        { fileCount: this.fileCount + 1, limit: this.limits.max_files }
      );
    }
  }

  /**
   * Enforce test limit (fail-closed)
   * @throws ResourceLimitError if limit would be exceeded
   */
  enforceTestLimit(_testId: string): void {
    if (this.testCount >= this.limits.max_tests) {
      throw new ResourceLimitError(
        ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED,
        `Test limit exceeded: ${this.testCount + 1} > ${this.limits.max_tests}`,
        { testCount: this.testCount + 1, limit: this.limits.max_tests }
      );
    }
  }

  /**
   * Enforce time limit (fail-closed)
   * @throws ResourceLimitError if limit is exceeded
   */
  enforceTimeLimit(): void {
    const elapsed = this.getElapsedSeconds();
    if (elapsed > this.limits.max_seconds) {
      throw new ResourceLimitError(
        ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED,
        `Time limit exceeded: ${elapsed} > ${this.limits.max_seconds}`,
        { elapsed, limit: this.limits.max_seconds }
      );
    }
  }

  /**
   * Check and record file operation (fail-closed)
   */
  checkAndRecordFileOperation(filePath: string): CheckResult {
    const newCount = this.fileCount + 1;

    if (newCount > this.limits.max_files) {
      const violation = createLimitViolation(
        'max_files',
        this.limits.max_files,
        newCount
      );
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
  checkAndRecordTestExecution(testId: string): CheckResult {
    const newCount = this.testCount + 1;

    if (newCount > this.limits.max_tests) {
      const violation = createLimitViolation(
        'max_tests',
        this.limits.max_tests,
        newCount
      );
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
  checkTimeLimit(): CheckResult {
    const elapsed = this.getElapsedSeconds();

    if (elapsed > this.limits.max_seconds) {
      const violation = createLimitViolation(
        'max_seconds',
        this.limits.max_seconds,
        elapsed
      );
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
  suggestChunkSize(totalFiles: number): number {
    const remaining = this.getRemainingFileCapacity();

    if (remaining <= 0) {
      return 0;
    }

    return Math.min(remaining, totalFiles);
  }

  /**
   * Get remaining file capacity
   */
  getRemainingFileCapacity(): number {
    return Math.max(0, this.limits.max_files - this.fileCount);
  }

  /**
   * Start a subagent
   * @throws ResourceLimitError if limit would be exceeded
   */
  startSubagent(subagentId: string): void {
    if (this.activeSubagents.size >= this.parallelLimits.subagents) {
      throw new ResourceLimitError(
        ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED,
        `Subagent limit exceeded: ${this.activeSubagents.size + 1} > ${this.parallelLimits.subagents}`,
        { activeCount: this.activeSubagents.size, limit: this.parallelLimits.subagents }
      );
    }

    this.activeSubagents.add(subagentId);
  }

  /**
   * End a subagent
   */
  endSubagent(subagentId: string): void {
    this.activeSubagents.delete(subagentId);
  }

  /**
   * Start an executor
   * @throws ResourceLimitError if limit would be exceeded
   */
  startExecutor(executorId: string): void {
    if (this.activeExecutors.size >= this.parallelLimits.executors) {
      throw new ResourceLimitError(
        ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED,
        `Executor limit exceeded: ${this.activeExecutors.size + 1} > ${this.parallelLimits.executors}`,
        { activeCount: this.activeExecutors.size, limit: this.parallelLimits.executors }
      );
    }

    this.activeExecutors.add(executorId);
  }

  /**
   * Get active subagent count
   */
  getActiveSubagentCount(): number {
    return this.activeSubagents.size;
  }

  /**
   * Get active executor count
   */
  getActiveExecutorCount(): number {
    return this.activeExecutors.size;
  }

  /**
   * Check if subagent limit is exceeded
   */
  isSubagentLimitExceeded(): boolean {
    return this.activeSubagents.size >= this.parallelLimits.subagents;
  }

  /**
   * Get all violations
   */
  getAllViolations(): LimitViolation[] {
    // Also check current state for any violations not yet recorded
    const currentViolations: LimitViolation[] = [...this.violations];

    if (this.isFileCountExceeded() && !currentViolations.some(v => v.limit_type === 'max_files')) {
      currentViolations.push(createLimitViolation('max_files', this.limits.max_files, this.fileCount));
    }

    if (this.isTestCountExceeded() && !currentViolations.some(v => v.limit_type === 'max_tests')) {
      currentViolations.push(createLimitViolation('max_tests', this.limits.max_tests, this.testCount));
    }

    return currentViolations;
  }

  /**
   * Reset counters for new task
   */
  reset(): void {
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
  getUsageStatistics(): UsageStatistics {
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
