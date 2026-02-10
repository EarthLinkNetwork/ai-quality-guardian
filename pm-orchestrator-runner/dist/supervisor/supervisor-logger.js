"use strict";
/**
 * Supervisor Logger - Decision Transparency
 *
 * AC A.1: Supervisor Log: TaskType判定、write許可、ガード判定、再試行/再開理由、採用したテンプレ
 *
 * Captures all supervisor decisions for Web UI observability.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupervisorLogger = void 0;
exports.getSupervisorLogger = getSupervisorLogger;
exports.resetSupervisorLogger = resetSupervisorLogger;
/**
 * SupervisorLogger - Centralized logging for supervisor decisions
 *
 * Features:
 * - Structured log entries with categories
 * - In-memory buffer for recent logs
 * - Subscriber pattern for real-time streaming to Web UI
 * - Task-scoped log retrieval
 */
class SupervisorLogger {
    entries = [];
    subscribers = new Set();
    maxEntries;
    constructor(options = {}) {
        this.maxEntries = options.maxEntries ?? 1000;
    }
    /**
     * Log a supervisor decision
     */
    log(level, category, message, options = {}) {
        const entry = {
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
            }
            catch {
                // Ignore subscriber errors
            }
        }
        return entry;
    }
    // Convenience methods for each category
    logTaskTypeDetection(taskType, input, options = {}) {
        return this.log('info', 'TASK_TYPE_DETECTION', `Detected TaskType: ${taskType}`, {
            details: {
                taskType,
                inputPreview: input.slice(0, 100) + (input.length > 100 ? '...' : ''),
                inputLength: input.length,
            },
            ...options,
        });
    }
    logWritePermission(allowed, reason, options = {}) {
        return this.log(allowed ? 'info' : 'warn', 'WRITE_PERMISSION', `Write permission: ${allowed ? 'ALLOWED' : 'DENIED'} - ${reason}`, {
            details: {
                allowed,
                reason,
                taskType: options.taskType,
            },
            taskId: options.taskId,
            projectId: options.projectId,
        });
    }
    logGuardDecision(guardName, passed, reason, options = {}) {
        return this.log(passed ? 'info' : 'warn', 'GUARD_DECISION', `Guard [${guardName}]: ${passed ? 'PASSED' : 'BLOCKED'} - ${reason}`, {
            details: {
                guardName,
                passed,
                reason,
                ...options.details,
            },
            taskId: options.taskId,
            projectId: options.projectId,
        });
    }
    logRetryResume(action, reason, options = {}) {
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
    logTemplateSelection(templateName, options = {}) {
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
    logExecutionStart(taskId, options = {}) {
        return this.log('info', 'EXECUTION_START', `Starting execution for task ${taskId}`, {
            details: {
                taskType: options.taskType,
                promptPreview: options.prompt?.slice(0, 100),
            },
            taskId,
            projectId: options.projectId,
        });
    }
    logExecutionEnd(taskId, success, options = {}) {
        return this.log(success ? 'info' : 'error', 'EXECUTION_END', `Execution ${success ? 'completed' : 'failed'} for task ${taskId}`, {
            details: {
                success,
                durationMs: options.durationMs,
                error: options.error,
            },
            taskId,
            projectId: options.projectId,
        });
    }
    logValidation(valid, violations, options = {}) {
        return this.log(valid ? 'info' : 'warn', 'VALIDATION', `Validation: ${valid ? 'PASSED' : 'FAILED'}`, {
            details: {
                valid,
                violationCount: violations.length,
                violations: violations.slice(0, 5), // Limit to first 5
            },
            ...options,
        });
    }
    logError(message, error, options = {}) {
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
    getAll() {
        return [...this.entries];
    }
    /**
     * Get logs for a specific task
     */
    getByTaskId(taskId) {
        return this.entries.filter((e) => e.taskId === taskId);
    }
    /**
     * Get logs by category
     */
    getByCategory(category) {
        return this.entries.filter((e) => e.category === category);
    }
    /**
     * Get logs since a timestamp
     */
    getSince(timestamp) {
        return this.entries.filter((e) => e.timestamp > timestamp);
    }
    /**
     * Get recent logs (last N entries)
     */
    getRecent(count = 50) {
        return this.entries.slice(-count);
    }
    /**
     * Clear all logs
     */
    clear() {
        this.entries = [];
    }
    // Subscription methods for real-time streaming
    /**
     * Subscribe to log events
     */
    subscribe(subscriber) {
        this.subscribers.add(subscriber);
        return () => this.subscribers.delete(subscriber);
    }
    /**
     * Get subscriber count
     */
    getSubscriberCount() {
        return this.subscribers.size;
    }
}
exports.SupervisorLogger = SupervisorLogger;
// Singleton instance for global access
let globalLogger = null;
function getSupervisorLogger() {
    if (!globalLogger) {
        globalLogger = new SupervisorLogger();
    }
    return globalLogger;
}
function resetSupervisorLogger() {
    globalLogger = null;
}
//# sourceMappingURL=supervisor-logger.js.map