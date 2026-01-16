/**
 * Fake Executor implementations for deterministic testing
 *
 * Per spec 10_REPL_UX.md Section 11 and spec 06_CORRECTNESS_PROPERTIES.md Property 37:
 * Integration tests must NOT depend on external Claude Code CLI.
 * Use FakeExecutor with Dependency Injection for deterministic testing.
 *
 * Types:
 * - SuccessFakeExecutor: Returns immediate success with configurable files
 * - BlockedFakeExecutor: Simulates executor blocking (Property 34-36)
 * - ErrorFakeExecutor: Returns immediate error
 * - TimeoutFakeExecutor: Simulates timeout after delay
 * - CustomFakeExecutor: Configurable behavior per task
 */

import type {
  IExecutor,
  ExecutorTask,
  ExecutorResult,
  VerifiedFile,
} from '../../src/executor/claude-code-executor';
import type { BlockedReason, TerminatedBy } from '../../src/models/enums';

/**
 * Base configuration for fake executors
 */
export interface FakeExecutorConfig {
  /** Delay before returning result (simulates execution time) */
  delay_ms?: number;
  /** Files to report as modified */
  files_modified?: string[];
  /** Verified files with existence info */
  verified_files?: VerifiedFile[];
  /** Output to include in result */
  output?: string;
}

/**
 * SuccessFakeExecutor - Returns immediate success
 *
 * Use this to test successful execution paths without Claude Code CLI.
 */
export class SuccessFakeExecutor implements IExecutor {
  private config: FakeExecutorConfig;

  constructor(config: FakeExecutorConfig = {}) {
    this.config = {
      delay_ms: config.delay_ms ?? 100,
      files_modified: config.files_modified ?? [],
      verified_files: config.verified_files ?? [],
      output: config.output ?? 'Fake execution completed successfully',
    };
  }

  async isClaudeCodeAvailable(): Promise<boolean> {
    return true;
  }

  async execute(task: ExecutorTask): Promise<ExecutorResult> {
    // Simulate execution delay
    if (this.config.delay_ms && this.config.delay_ms > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.delay_ms));
    }

    // Build verified_files from config or auto-generate
    const verified_files: VerifiedFile[] =
      this.config.verified_files && this.config.verified_files.length > 0
        ? this.config.verified_files
        : this.config.files_modified?.map((p) => ({
            path: p,
            exists: true,
            size: 100,
            content_preview: 'Fake content',
          })) ?? [];

    return {
      executed: true,
      output: this.config.output!,
      files_modified: this.config.files_modified!,
      duration_ms: this.config.delay_ms!,
      status: 'COMPLETE',
      cwd: task.workingDir,
      verified_files,
      unverified_files: [],
    };
  }
}

/**
 * BlockedFakeExecutor - Simulates executor blocking (Property 34-36)
 *
 * Use this to test Fail-Closed behavior without real blocking.
 */
export class BlockedFakeExecutor implements IExecutor {
  private blockedReason: BlockedReason;
  private terminatedBy: TerminatedBy;
  private delay_ms: number;
  private output: string;

  constructor(
    blockedReason: BlockedReason = 'INTERACTIVE_PROMPT',
    terminatedBy: TerminatedBy = 'REPL_FAIL_CLOSED',
    delay_ms: number = 100,
    output: string = ''
  ) {
    this.blockedReason = blockedReason;
    this.terminatedBy = terminatedBy;
    this.delay_ms = delay_ms;
    this.output = output;
  }

  async isClaudeCodeAvailable(): Promise<boolean> {
    return true;
  }

  async execute(task: ExecutorTask): Promise<ExecutorResult> {
    // Simulate delay before blocking detection
    if (this.delay_ms > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delay_ms));
    }

    return {
      executed: false,
      output: this.output,
      error: `Executor blocked: ${this.blockedReason}`,
      files_modified: [],
      duration_ms: this.delay_ms,
      status: 'BLOCKED',
      cwd: task.workingDir,
      verified_files: [],
      unverified_files: [],
      executor_blocked: true,
      blocked_reason: this.blockedReason,
      timeout_ms: this.delay_ms,
      terminated_by: this.terminatedBy,
    };
  }
}

/**
 * ErrorFakeExecutor - Returns immediate error
 *
 * Use this to test error handling paths.
 */
export class ErrorFakeExecutor implements IExecutor {
  private errorMessage: string;
  private delay_ms: number;

  constructor(errorMessage: string = 'Fake execution error', delay_ms: number = 100) {
    this.errorMessage = errorMessage;
    this.delay_ms = delay_ms;
  }

  async isClaudeCodeAvailable(): Promise<boolean> {
    return true;
  }

  async execute(task: ExecutorTask): Promise<ExecutorResult> {
    if (this.delay_ms > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delay_ms));
    }

    return {
      executed: false,
      output: '',
      error: this.errorMessage,
      files_modified: [],
      duration_ms: this.delay_ms,
      status: 'ERROR',
      cwd: task.workingDir,
      verified_files: [],
      unverified_files: [],
    };
  }
}

/**
 * TimeoutFakeExecutor - Simulates timeout after delay
 *
 * Use this to test timeout detection (Property 35).
 */
export class TimeoutFakeExecutor implements IExecutor {
  private timeout_ms: number;

  constructor(timeout_ms: number = 30000) {
    this.timeout_ms = timeout_ms;
  }

  async isClaudeCodeAvailable(): Promise<boolean> {
    return true;
  }

  async execute(task: ExecutorTask): Promise<ExecutorResult> {
    // Simulate long execution that would trigger timeout
    await new Promise((resolve) => setTimeout(resolve, this.timeout_ms));

    return {
      executed: false,
      output: '',
      error: `Execution timed out after ${this.timeout_ms}ms`,
      files_modified: [],
      duration_ms: this.timeout_ms,
      status: 'BLOCKED',
      cwd: task.workingDir,
      verified_files: [],
      unverified_files: [],
      executor_blocked: true,
      blocked_reason: 'TIMEOUT',
      timeout_ms: this.timeout_ms,
      terminated_by: 'TIMEOUT',
    };
  }
}

/**
 * UnavailableFakeExecutor - Simulates Claude Code CLI not available
 *
 * Use this to test fail-closed behavior when CLI is missing.
 */
export class UnavailableFakeExecutor implements IExecutor {
  async isClaudeCodeAvailable(): Promise<boolean> {
    return false;
  }

  async execute(task: ExecutorTask): Promise<ExecutorResult> {
    return {
      executed: false,
      output: '',
      error: 'Claude Code CLI not available',
      files_modified: [],
      duration_ms: 0,
      status: 'ERROR',
      cwd: task.workingDir,
      verified_files: [],
      unverified_files: [],
    };
  }
}

/**
 * Custom executor behavior configuration
 */
export interface CustomExecutorBehavior {
  /** Return success or failure */
  success: boolean;
  /** Status to return */
  status: ExecutorResult['status'];
  /** Output to return */
  output?: string;
  /** Error message if failed */
  error?: string;
  /** Files modified */
  files_modified?: string[];
  /** Verified files */
  verified_files?: VerifiedFile[];
  /** Blocking info */
  executor_blocked?: boolean;
  blocked_reason?: BlockedReason;
  terminated_by?: TerminatedBy;
  /** Delay before returning */
  delay_ms?: number;
}

/**
 * CustomFakeExecutor - Configurable behavior per task
 *
 * Use this when you need different behaviors for different tasks in the same test.
 */
export class CustomFakeExecutor implements IExecutor {
  private behaviors: Map<string, CustomExecutorBehavior>;
  private defaultBehavior: CustomExecutorBehavior;
  private available: boolean;

  constructor(
    defaultBehavior: CustomExecutorBehavior = {
      success: true,
      status: 'COMPLETE',
      output: 'Default fake output',
    },
    available: boolean = true
  ) {
    this.behaviors = new Map();
    this.defaultBehavior = defaultBehavior;
    this.available = available;
  }

  /**
   * Set behavior for a specific task prompt pattern
   */
  setBehavior(promptPattern: string, behavior: CustomExecutorBehavior): void {
    this.behaviors.set(promptPattern, behavior);
  }

  async isClaudeCodeAvailable(): Promise<boolean> {
    return this.available;
  }

  async execute(task: ExecutorTask): Promise<ExecutorResult> {
    // Find matching behavior by prompt pattern
    let behavior = this.defaultBehavior;
    for (const [pattern, b] of this.behaviors) {
      if (task.prompt.includes(pattern)) {
        behavior = b;
        break;
      }
    }

    // Apply delay if specified
    if (behavior.delay_ms && behavior.delay_ms > 0) {
      await new Promise((resolve) => setTimeout(resolve, behavior.delay_ms));
    }

    const duration_ms = behavior.delay_ms ?? 100;

    // Build verified_files
    const verified_files: VerifiedFile[] =
      behavior.verified_files ??
      (behavior.files_modified?.map((p) => ({
        path: p,
        exists: true,
        size: 100,
      })) ||
        []);

    const result: ExecutorResult = {
      executed: behavior.success,
      output: behavior.output ?? '',
      error: behavior.error,
      files_modified: behavior.files_modified ?? [],
      duration_ms,
      status: behavior.status,
      cwd: task.workingDir,
      verified_files,
      unverified_files: [],
    };

    // Add blocking info if present
    if (behavior.executor_blocked) {
      result.executor_blocked = true;
      result.blocked_reason = behavior.blocked_reason;
      result.terminated_by = behavior.terminated_by;
      result.timeout_ms = duration_ms;
    }

    return result;
  }
}

/**
 * Factory function to create a FakeExecutor for common test scenarios
 */
export function createFakeExecutor(
  scenario: 'success' | 'blocked' | 'error' | 'timeout' | 'unavailable',
  options?: FakeExecutorConfig & {
    blockedReason?: BlockedReason;
    errorMessage?: string;
    timeout_ms?: number;
  }
): IExecutor {
  switch (scenario) {
    case 'success':
      return new SuccessFakeExecutor(options);
    case 'blocked':
      return new BlockedFakeExecutor(
        options?.blockedReason ?? 'INTERACTIVE_PROMPT',
        'REPL_FAIL_CLOSED',
        options?.delay_ms ?? 100,
        options?.output ?? ''
      );
    case 'error':
      return new ErrorFakeExecutor(options?.errorMessage, options?.delay_ms);
    case 'timeout':
      return new TimeoutFakeExecutor(options?.timeout_ms ?? 5000);
    case 'unavailable':
      return new UnavailableFakeExecutor();
  }
}
