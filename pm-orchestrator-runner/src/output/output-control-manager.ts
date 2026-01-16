/**
 * Output Control Manager
 * Based on 06_CORRECTNESS_PROPERTIES.md L141-147 (Property 15)
 *
 * Property 15: Output Control and Validation
 * - All Claude Code output must be validated by Runner
 * - Output without evidence, speculative expressions, direct communication are rejected
 *
 * Responsible for:
 * - JSON-structured output
 * - next_action field determination
 * - incomplete_task_reasons
 * - Output validation
 * - Evidence summary
 * - Error output formatting
 * - Progress output
 * - Output streaming (NDJSON)
 * - Output destinations
 * - Report generation
 * - Output redaction
 * - Exit codes
 */

import * as fs from 'fs';
import * as path from 'path';
import { OverallStatus, TaskStatus } from '../models/enums';
import { ErrorCode, getErrorMessage } from '../errors/error-codes';

/**
 * Output Control Manager Error
 */
export class OutputControlError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>) {
    super(message || getErrorMessage(code));
    this.name = 'OutputControlError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Format options interface
 */
interface FormatOptions {
  compact?: boolean;
}

/**
 * Incomplete task interface
 */
interface IncompleteTask {
  task_id: string;
  reason: string;
}

/**
 * Evidence interface
 */
interface Evidence {
  files_collected: number;
  hash: string;
  index_hash?: string;
  location: string;
}

/**
 * Error info interface
 */
interface ErrorInfo {
  code: ErrorCode;
  message: string;
  stack?: string;
}

/**
 * Output result interface
 */
interface OutputResult {
  session_id: string;
  overall_status: OverallStatus;
  tasks_completed?: number;
  tasks_total?: number;
  evidence_hash?: string;
  incomplete_tasks?: IncompleteTask[];
  evidence?: Evidence;
  error?: ErrorInfo;
  error_message?: string;
  config?: Record<string, unknown>;
}

/**
 * Progress update interface
 */
interface ProgressUpdate {
  session_id: string;
  current_phase: string;
  tasks_completed: number;
  tasks_total: number;
  elapsed_seconds?: number;
  estimated_remaining_seconds?: number;
}

/**
 * Phase info interface
 */
interface PhaseInfo {
  name: string;
  status: string;
  duration_seconds: number;
}

/**
 * Task info interface
 */
interface TaskInfo {
  id: string;
  status: TaskStatus;
  duration_seconds: number;
}

/**
 * Execution result interface
 */
interface ExecutionResult {
  session_id: string;
  overall_status: OverallStatus;
  started_at: string;
  completed_at: string;
  tasks_completed: number;
  tasks_total: number;
  phases?: PhaseInfo[];
  tasks?: TaskInfo[];
}

/**
 * Report interface
 */
interface Report {
  session_id: string;
  overall_status: OverallStatus;
  duration_seconds: number;
  phases?: PhaseInfo[];
  task_summary?: {
    completed: number;
    total: number;
  };
}

/**
 * Output callback type
 */
type OutputCallback = (output: string) => void;

/**
 * Sensitive field patterns for redaction
 */
const SENSITIVE_PATTERNS = [
  'api_key',
  'apikey',
  'token',
  'secret',
  'password',
  'credential',
  'auth',
  'bearer',
];

/**
 * Exit codes for different statuses
 */
const EXIT_CODES: Record<OverallStatus, number> = {
  [OverallStatus.COMPLETE]: 0,
  [OverallStatus.INCOMPLETE]: 1,
  [OverallStatus.NO_EVIDENCE]: 2,
  [OverallStatus.ERROR]: 3,
  [OverallStatus.INVALID]: 4,
};

/**
 * Valid OverallStatus values
 */
const VALID_STATUSES = Object.values(OverallStatus);

/**
 * Output Control Manager class
 */
export class OutputControlManager {
  private debugMode: boolean = false;
  private redactionEnabled: boolean = true;
  private streamingEnabled: boolean = false;
  private destination: string = 'stdout';
  private outputCallbacks: OutputCallback[] = [];

  /**
   * Create a new OutputControlManager
   */
  constructor() {
    // Default configuration
  }

  /**
   * Set debug mode
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  /**
   * Set redaction enabled
   */
  setRedactionEnabled(enabled: boolean): void {
    this.redactionEnabled = enabled;
  }

  /**
   * Enable streaming output
   */
  enableStreaming(enabled: boolean): void {
    this.streamingEnabled = enabled;
  }

  /**
   * Register output callback
   */
  onOutput(callback: OutputCallback): void {
    this.outputCallbacks.push(callback);
  }

  /**
   * Get default destination
   */
  getDefaultDestination(): string {
    return 'stdout';
  }

  /**
   * Set output destination
   * @throws OutputControlError if path is not writable
   */
  setDestination(filePath: string): void {
    // Validate that the directory exists and is writable
    const dir = path.dirname(filePath);
    try {
      fs.accessSync(dir, fs.constants.W_OK);
    } catch {
      throw new OutputControlError(
        ErrorCode.E208_OUTPUT_VALIDATION_FAILED,
        `Output destination is not writable: ${filePath}`,
        { path: filePath }
      );
    }

    this.destination = filePath;
  }

  /**
   * Get current destination
   */
  getDestination(): string {
    return this.destination;
  }

  /**
   * Validate output result
   * @throws OutputControlError if validation fails
   */
  private validateResult(result: OutputResult, strict: boolean = false): void {
    // Check required fields
    if (!result.session_id) {
      throw new OutputControlError(
        ErrorCode.E208_OUTPUT_VALIDATION_FAILED,
        'Missing required field: session_id',
        { result }
      );
    }

    if (result.overall_status === undefined) {
      throw new OutputControlError(
        ErrorCode.E208_OUTPUT_VALIDATION_FAILED,
        'Missing required field: overall_status',
        { result }
      );
    }

    // Validate overall_status is a valid enum value
    if (!VALID_STATUSES.includes(result.overall_status)) {
      throw new OutputControlError(
        ErrorCode.E208_OUTPUT_VALIDATION_FAILED,
        `Invalid overall_status: ${result.overall_status}`,
        { result }
      );
    }

    // In strict mode, require tasks_completed and tasks_total
    if (strict) {
      if (result.tasks_completed === undefined) {
        throw new OutputControlError(
          ErrorCode.E208_OUTPUT_VALIDATION_FAILED,
          'Missing required field: tasks_completed',
          { result }
        );
      }

      if (result.tasks_total === undefined) {
        throw new OutputControlError(
          ErrorCode.E208_OUTPUT_VALIDATION_FAILED,
          'Missing required field: tasks_total',
          { result }
        );
      }
    }

    // Validate tasks_completed <= tasks_total when both are provided
    if (result.tasks_completed !== undefined && result.tasks_total !== undefined) {
      if (result.tasks_completed > result.tasks_total) {
        throw new OutputControlError(
          ErrorCode.E208_OUTPUT_VALIDATION_FAILED,
          `tasks_completed (${result.tasks_completed}) cannot exceed tasks_total (${result.tasks_total})`,
          { result }
        );
      }
    }
  }

  /**
   * Determine next_action based on status
   */
  private determineNextAction(status: OverallStatus): boolean {
    return status === OverallStatus.COMPLETE;
  }

  /**
   * Get reason for next_action
   */
  private getNextActionReason(status: OverallStatus, errorMessage?: string): string {
    switch (status) {
      case OverallStatus.COMPLETE:
        return 'All tasks completed successfully';
      case OverallStatus.INCOMPLETE:
        return 'Some tasks are incomplete';
      case OverallStatus.ERROR:
        return errorMessage || 'An error occurred during execution';
      case OverallStatus.INVALID:
        return 'Session status is invalid';
      case OverallStatus.NO_EVIDENCE:
        return 'No evidence collected';
      default:
        return 'Unknown status';
    }
  }

  /**
   * Redact sensitive information from an object
   */
  private redactSensitiveData(obj: Record<string, unknown>): Record<string, unknown> {
    if (!this.redactionEnabled) {
      return obj;
    }

    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = SENSITIVE_PATTERNS.some(pattern => lowerKey.includes(pattern));

      if (isSensitive && typeof value === 'string') {
        result[key] = '[REDACTED]';
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.redactSensitiveData(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Format output result as JSON
   * @throws OutputControlError if validation fails
   */
  formatOutput(result: OutputResult, options?: FormatOptions): string {
    // Validate the result
    this.validateResult(result);

    // Build output object
    const output: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      session_id: result.session_id,
      overall_status: result.overall_status,
      tasks_completed: result.tasks_completed,
      tasks_total: result.tasks_total,
      next_action: this.determineNextAction(result.overall_status),
      next_action_reason: this.getNextActionReason(result.overall_status, result.error_message),
    };

    // Add evidence_hash if provided
    if (result.evidence_hash) {
      output.evidence_hash = result.evidence_hash;
    }

    // Add incomplete_task_reasons
    if (result.incomplete_tasks) {
      output.incomplete_task_reasons = result.incomplete_tasks;
    } else {
      output.incomplete_task_reasons = [];
    }

    // Add evidence_summary if provided
    if (result.evidence) {
      output.evidence_summary = {
        files_collected: result.evidence.files_collected,
        hash: result.evidence.hash,
        ...(result.evidence.index_hash && { index_hash: result.evidence.index_hash }),
        location: result.evidence.location,
      };
    }

    // Add error if provided
    if (result.error) {
      output.error = {
        code: result.error.code,
        message: result.error.message,
        ...(this.debugMode && result.error.stack && { stack: result.error.stack }),
      };
    }

    // Add config (redacted if needed)
    if (result.config) {
      output.config = this.redactSensitiveData(result.config);
    }

    // Format as JSON
    const indent = options?.compact ? 0 : 2;
    return JSON.stringify(output, null, indent);
  }

  /**
   * Format progress update
   */
  formatProgress(progressUpdate: ProgressUpdate): string {
    const progressPercent = progressUpdate.tasks_total > 0
      ? Math.round((progressUpdate.tasks_completed / progressUpdate.tasks_total) * 100)
      : 0;

    const output: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      type: 'progress',
      session_id: progressUpdate.session_id,
      current_phase: progressUpdate.current_phase,
      tasks_completed: progressUpdate.tasks_completed,
      tasks_total: progressUpdate.tasks_total,
      progress_percent: progressPercent,
    };

    if (progressUpdate.elapsed_seconds !== undefined) {
      output.elapsed_seconds = progressUpdate.elapsed_seconds;
    }

    if (progressUpdate.estimated_remaining_seconds !== undefined) {
      output.eta_seconds = progressUpdate.estimated_remaining_seconds;
    }

    return JSON.stringify(output, null, 2);
  }

  /**
   * Emit progress in streaming mode
   */
  emitProgress(progressUpdate: ProgressUpdate): void {
    if (!this.streamingEnabled) {
      return;
    }

    const output = JSON.stringify({
      timestamp: new Date().toISOString(),
      type: 'progress',
      session_id: progressUpdate.session_id,
      current_phase: progressUpdate.current_phase,
      tasks_completed: progressUpdate.tasks_completed,
      tasks_total: progressUpdate.tasks_total,
    });

    // Notify all callbacks
    for (const callback of this.outputCallbacks) {
      callback(output);
    }
  }

  /**
   * Generate final execution report
   */
  generateReport(executionResult: ExecutionResult): Report {
    const startedAt = new Date(executionResult.started_at);
    const completedAt = new Date(executionResult.completed_at);
    const durationSeconds = Math.round((completedAt.getTime() - startedAt.getTime()) / 1000);

    const report: Report = {
      session_id: executionResult.session_id,
      overall_status: executionResult.overall_status,
      duration_seconds: durationSeconds,
    };

    if (executionResult.phases) {
      report.phases = executionResult.phases;
    }

    if (executionResult.tasks || executionResult.tasks_total !== undefined) {
      report.task_summary = {
        completed: executionResult.tasks_completed,
        total: executionResult.tasks_total,
      };
    }

    return report;
  }

  /**
   * Get exit code for a status
   */
  getExitCode(status: OverallStatus): number {
    return EXIT_CODES[status];
  }
}
