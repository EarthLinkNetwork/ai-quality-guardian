/**
 * Supervisor Logger - Decision Transparency
 *
 * AC A.1: Supervisor Log: TaskType判定、write許可、ガード判定、再試行/再開理由、採用したテンプレ
 *
 * Captures all supervisor decisions for Web UI observability.
 */
export type SupervisorLogLevel = 'info' | 'warn' | 'error' | 'debug';
export type SupervisorLogCategory = 'TASK_TYPE_DETECTION' | 'WRITE_PERMISSION' | 'GUARD_DECISION' | 'RETRY_RESUME' | 'TEMPLATE_SELECTION' | 'EXECUTION_START' | 'EXECUTION_END' | 'VALIDATION' | 'ERROR';
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
export declare class SupervisorLogger {
    private entries;
    private subscribers;
    private maxEntries;
    constructor(options?: {
        maxEntries?: number;
    });
    /**
     * Log a supervisor decision
     */
    log(level: SupervisorLogLevel, category: SupervisorLogCategory, message: string, options?: {
        details?: Record<string, unknown>;
        taskId?: string;
        projectId?: string;
    }): SupervisorLogEntry;
    logTaskTypeDetection(taskType: string, input: string, options?: {
        taskId?: string;
        projectId?: string;
    }): SupervisorLogEntry;
    logWritePermission(allowed: boolean, reason: string, options?: {
        taskId?: string;
        projectId?: string;
        taskType?: string;
    }): SupervisorLogEntry;
    logGuardDecision(guardName: string, passed: boolean, reason: string, options?: {
        taskId?: string;
        projectId?: string;
        details?: Record<string, unknown>;
    }): SupervisorLogEntry;
    logRetryResume(action: 'retry' | 'resume' | 'rollback', reason: string, options?: {
        taskId?: string;
        projectId?: string;
        attempt?: number;
        maxAttempts?: number;
    }): SupervisorLogEntry;
    logTemplateSelection(templateName: string, options?: {
        taskId?: string;
        projectId?: string;
        templateType?: string;
        source?: string;
    }): SupervisorLogEntry;
    logExecutionStart(taskId: string, options?: {
        projectId?: string;
        taskType?: string;
        prompt?: string;
    }): SupervisorLogEntry;
    logExecutionEnd(taskId: string, success: boolean, options?: {
        projectId?: string;
        durationMs?: number;
        error?: string;
    }): SupervisorLogEntry;
    logValidation(valid: boolean, violations: Array<{
        type: string;
        message: string;
    }>, options?: {
        taskId?: string;
        projectId?: string;
    }): SupervisorLogEntry;
    logError(message: string, error: Error | unknown, options?: {
        taskId?: string;
        projectId?: string;
    }): SupervisorLogEntry;
    /**
     * Get all logs
     */
    getAll(): SupervisorLogEntry[];
    /**
     * Get logs for a specific task
     */
    getByTaskId(taskId: string): SupervisorLogEntry[];
    /**
     * Get logs by category
     */
    getByCategory(category: SupervisorLogCategory): SupervisorLogEntry[];
    /**
     * Get logs since a timestamp
     */
    getSince(timestamp: string): SupervisorLogEntry[];
    /**
     * Get recent logs (last N entries)
     */
    getRecent(count?: number): SupervisorLogEntry[];
    /**
     * Clear all logs
     */
    clear(): void;
    /**
     * Subscribe to log events
     */
    subscribe(subscriber: SupervisorLogSubscriber): () => void;
    /**
     * Get subscriber count
     */
    getSubscriberCount(): number;
}
export declare function getSupervisorLogger(): SupervisorLogger;
export declare function resetSupervisorLogger(): void;
//# sourceMappingURL=supervisor-logger.d.ts.map