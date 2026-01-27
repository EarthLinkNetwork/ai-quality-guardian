"use strict";
/**
 * Generic Event Model
 *
 * Unified event system for all observable incidents in pm-orchestrator-runner.
 * All events (file diffs, executor runs, task state changes, session events)
 * are treated uniformly - no symptom-specific handling.
 *
 * Design principles:
 * - Single event type covers all observables
 * - No category-specific branching
 * - Persistence survives restarts
 * - Non-destructive (read-only inspection)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEvent = createEvent;
exports.createFileChangeEvent = createFileChangeEvent;
exports.createExecutorEvent = createExecutorEvent;
exports.createTaskEvent = createTaskEvent;
exports.createSessionEvent = createSessionEvent;
exports.createCommandEvent = createCommandEvent;
exports.isFileChangeData = isFileChangeData;
exports.isExecutorEventData = isExecutorEventData;
exports.isTaskEventData = isTaskEventData;
exports.isSessionEventData = isSessionEventData;
exports.isCommandEventData = isCommandEventData;
const uuid_1 = require("uuid");
/**
 * Create a new event
 */
function createEvent(source, summary, data, relations, tags) {
    return {
        id: `evt-${(0, uuid_1.v4)()}`,
        timestamp: new Date().toISOString(),
        source,
        summary,
        data,
        relations: relations || {},
        tags,
    };
}
/**
 * Create a file change event
 */
function createFileChangeEvent(path, status, options) {
    const data = {
        path,
        status,
        oldPath: options?.oldPath,
        diff: options?.diff,
    };
    return createEvent('file_change', `File ${status}: ${path}`, data, {
        taskId: options?.taskId,
        sessionId: options?.sessionId,
    });
}
/**
 * Create an executor event
 */
function createExecutorEvent(executorId, action, options) {
    const data = {
        executorId,
        action,
        taskId: options?.taskId,
        stdout: options?.stdout,
        stderr: options?.stderr,
        exitCode: options?.exitCode,
        command: options?.command,
        durationMs: options?.durationMs,
    };
    const summary = action === 'start'
        ? `Executor ${executorId} started`
        : action === 'end'
            ? `Executor ${executorId} ended (exit: ${options?.exitCode ?? 'unknown'})`
            : action === 'error'
                ? `Executor ${executorId} error`
                : `Executor ${executorId} output`;
    return createEvent('executor', summary, data, {
        taskId: options?.taskId,
        sessionId: options?.sessionId,
        executorId,
    });
}
/**
 * Create a task event
 */
function createTaskEvent(taskId, newStatus, options) {
    const data = {
        taskId,
        previousStatus: options?.previousStatus,
        newStatus,
        description: options?.description,
        filesModified: options?.filesModified,
        error: options?.error,
    };
    const summary = options?.previousStatus
        ? `Task ${taskId}: ${options.previousStatus} → ${newStatus}`
        : `Task ${taskId}: ${newStatus}`;
    return createEvent('task', summary, data, {
        taskId,
        sessionId: options?.sessionId,
    });
}
/**
 * Create a session event
 */
function createSessionEvent(sessionId, action, options) {
    const data = {
        sessionId,
        action,
        projectPath: options?.projectPath,
        status: options?.status,
    };
    return createEvent('session', `Session ${sessionId} ${action}`, data, { sessionId });
}
/**
 * Create a command event
 */
function createCommandEvent(command, success, options) {
    const data = {
        command,
        args: options?.args,
        success,
        output: options?.output,
        error: options?.error,
    };
    return createEvent('command', `Command: ${command}${options?.args ? ' ' + options.args : ''} (${success ? 'success' : 'failed'})`, data, {
        taskId: options?.taskId,
        sessionId: options?.sessionId,
    });
}
/**
 * Type guard for FileChangeData
 */
function isFileChangeData(data) {
    return 'path' in data && 'status' in data;
}
/**
 * Type guard for ExecutorEventData
 */
function isExecutorEventData(data) {
    return 'executorId' in data && 'action' in data;
}
/**
 * Type guard for TaskEventData
 */
function isTaskEventData(data) {
    return 'taskId' in data && 'newStatus' in data;
}
/**
 * Type guard for SessionEventData
 */
function isSessionEventData(data) {
    return 'sessionId' in data && 'action' in data;
}
/**
 * Type guard for CommandEventData
 */
function isCommandEventData(data) {
    return 'command' in data && 'success' in data;
}
//# sourceMappingURL=event.js.map