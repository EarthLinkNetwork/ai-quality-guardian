/**
 * Supervisor Logger - Decision Transparency
 *
 * AC A.1: Supervisor Log: TaskType判定、write許可、ガード判定、再試行/再開理由、採用したテンプレ
 *
 * Captures all supervisor decisions for Web UI observability.
 */

export type SupervisorLogLevel = 'info' | 'warn' | 'error' | 'debug';

export type SupervisorLogCategory =
  | 'TASK_TYPE_DETECTION'
  | 'WRITE_PERMISSION'
  | 'GUARD_DECISION'
  | 'RETRY_RESUME'
  | 'TEMPLATE_SELECTION'
  | 'EXECUTION_START'
  | 'EXECUTION_END'
  | 'VALIDATION'
  | 'ERROR';

export interface SupervisorLogEntry {
  timestamp: string;
  level: SupervisorLogLevel;
  category: SupervisorLogCategory;
  message: string;
  details?: Record<string, unknown>;
  taskId?: string;
  projectId?: string;
}

export interface SupervisorLogSubscriber {
  onLog(entry: SupervisorLogEntry): void;
}

/**
 * SupervisorLogger - Centralized logging for supervisor decisions
 *
 * Features:
 * - Structured log entries with categories
 * - In-memory buffer for recent logs
 * - Subscriber pattern for real-time streaming to Web UI
 * - Task-scoped log retrieval
 */
export class SupervisorLogger {
  private entries: SupervisorLogEntry[] = [];
  private subscribers: Set<SupervisorLogSubscriber> = new Set();
  private maxEntries: number;

  constructor(options: { maxEntries?: number } = {}) {
    this.maxEntries = options.maxEntries ?? 1000;
  }

  /**
   * Log a supervisor decision
   */
  log(
    level: SupervisorLogLevel,
    category: SupervisorLogCategory,
    message: string,
    options: {
      details?: Record<string, unknown>;
      taskId?: string;
      projectId?: string;
    } = {}
  ): SupervisorLogEntry {
    const entry: SupervisorLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      details: options.details,
      taskId: options.taskId,
      projectId: options.projectId,
    };

    this.entries.push(entry);

    // Trim if over limit
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    // Notify subscribers
    for (const subscriber of this.subscribers) {
      try {
        subscriber.onLog(entry);
      } catch {
        // Ignore subscriber errors
      }
    }

    return entry;
  }

  // Convenience methods for each category

  logTaskTypeDetection(
    taskType: string,
    input: string,
    options: { taskId?: string; projectId?: string } = {}
  ): SupervisorLogEntry {
    return this.log('info', 'TASK_TYPE_DETECTION', `Detected TaskType: ${taskType}`, {
      details: {
        taskType,
        inputPreview: input.slice(0, 100) + (input.length > 100 ? '...' : ''),
        inputLength: input.length,
      },
      ...options,
    });
  }

  logWritePermission(
    allowed: boolean,
    reason: string,
    options: { taskId?: string; projectId?: string; taskType?: string } = {}
  ): SupervisorLogEntry {
    return this.log(
      allowed ? 'info' : 'warn',
      'WRITE_PERMISSION',
      `Write permission: ${allowed ? 'ALLOWED' : 'DENIED'} - ${reason}`,
      {
        details: {
          allowed,
          reason,
          taskType: options.taskType,
        },
        taskId: options.taskId,
        projectId: options.projectId,
      }
    );
  }

  logGuardDecision(
    guardName: string,
    passed: boolean,
    reason: string,
    options: { taskId?: string; projectId?: string; details?: Record<string, unknown> } = {}
  ): SupervisorLogEntry {
    return this.log(
      passed ? 'info' : 'warn',
      'GUARD_DECISION',
      `Guard [${guardName}]: ${passed ? 'PASSED' : 'BLOCKED'} - ${reason}`,
      {
        details: {
          guardName,
          passed,
          reason,
          ...options.details,
        },
        taskId: options.taskId,
        projectId: options.projectId,
      }
    );
  }

  logRetryResume(
    action: 'retry' | 'resume' | 'rollback',
    reason: string,
    options: { taskId?: string; projectId?: string; attempt?: number; maxAttempts?: number } = {}
  ): SupervisorLogEntry {
    return this.log('info', 'RETRY_RESUME', `${action.toUpperCase()}: ${reason}`, {
      details: {
        action,
        reason,
        attempt: options.attempt,
        maxAttempts: options.maxAttempts,
      },
      taskId: options.taskId,
      projectId: options.projectId,
    });
  }

  logTemplateSelection(
    templateName: string,
    options: { taskId?: string; projectId?: string; templateType?: string; source?: string } = {}
  ): SupervisorLogEntry {
    return this.log('info', 'TEMPLATE_SELECTION', `Selected template: ${templateName}`, {
      details: {
        templateName,
        templateType: options.templateType,
        source: options.source,
      },
      taskId: options.taskId,
      projectId: options.projectId,
    });
  }

  logExecutionStart(
    taskId: string,
    options: { projectId?: string; taskType?: string; prompt?: string } = {}
  ): SupervisorLogEntry {
    return this.log('info', 'EXECUTION_START', `Starting execution for task ${taskId}`, {
      details: {
        taskType: options.taskType,
        promptPreview: options.prompt?.slice(0, 100),
      },
      taskId,
      projectId: options.projectId,
    });
  }

  logExecutionEnd(
    taskId: string,
    success: boolean,
    options: { projectId?: string; durationMs?: number; error?: string } = {}
  ): SupervisorLogEntry {
    return this.log(
      success ? 'info' : 'error',
      'EXECUTION_END',
      `Execution ${success ? 'completed' : 'failed'} for task ${taskId}`,
      {
        details: {
          success,
          durationMs: options.durationMs,
          error: options.error,
        },
        taskId,
        projectId: options.projectId,
      }
    );
  }

  logValidation(
    valid: boolean,
    violations: Array<{ type: string; message: string }>,
    options: { taskId?: string; projectId?: string } = {}
  ): SupervisorLogEntry {
    return this.log(valid ? 'info' : 'warn', 'VALIDATION', `Validation: ${valid ? 'PASSED' : 'FAILED'}`, {
      details: {
        valid,
        violationCount: violations.length,
        violations: violations.slice(0, 5), // Limit to first 5
      },
      ...options,
    });
  }

  logError(
    message: string,
    error: Error | unknown,
    options: { taskId?: string; projectId?: string } = {}
  ): SupervisorLogEntry {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    return this.log('error', 'ERROR', message, {
      details: {
        error: errorMessage,
        stack: errorStack,
      },
      ...options,
    });
  }

  // Retrieval methods

  /**
   * Get all logs
   */
  getAll(): SupervisorLogEntry[] {
    return [...this.entries];
  }

  /**
   * Get logs for a specific task
   */
  getByTaskId(taskId: string): SupervisorLogEntry[] {
    return this.entries.filter((e) => e.taskId === taskId);
  }

  /**
   * Get logs by category
   */
  getByCategory(category: SupervisorLogCategory): SupervisorLogEntry[] {
    return this.entries.filter((e) => e.category === category);
  }

  /**
   * Get logs since a timestamp
   */
  getSince(timestamp: string): SupervisorLogEntry[] {
    return this.entries.filter((e) => e.timestamp > timestamp);
  }

  /**
   * Get recent logs (last N entries)
   */
  getRecent(count: number = 50): SupervisorLogEntry[] {
    return this.entries.slice(-count);
  }

  /**
   * Clear all logs
   */
  clear(): void {
    this.entries = [];
  }

  // Subscription methods for real-time streaming

  /**
   * Subscribe to log events
   */
  subscribe(subscriber: SupervisorLogSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  /**
   * Get subscriber count
   */
  getSubscriberCount(): number {
    return this.subscribers.size;
  }
}

// Singleton instance for global access
let globalLogger: SupervisorLogger | null = null;

export function getSupervisorLogger(): SupervisorLogger {
  if (!globalLogger) {
    globalLogger = new SupervisorLogger();
  }
  return globalLogger;
}

export function resetSupervisorLogger(): void {
  globalLogger = null;
}
