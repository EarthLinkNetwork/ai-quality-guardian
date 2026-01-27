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
/**
 * Event source type - what generated this event
 */
export type EventSource = 'file_change' | 'executor' | 'task' | 'session' | 'command' | 'system';
/**
 * File change details
 */
export interface FileChangeData {
    path: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    oldPath?: string;
    diff?: string;
}
/**
 * Executor event data
 */
export interface ExecutorEventData {
    executorId: string;
    action: 'start' | 'end' | 'output' | 'error';
    taskId?: string;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    command?: string;
    durationMs?: number;
}
/**
 * Task event data
 */
export interface TaskEventData {
    taskId: string;
    previousStatus?: string;
    newStatus: string;
    description?: string;
    filesModified?: string[];
    error?: {
        code: string;
        message: string;
    };
}
/**
 * Session event data
 */
export interface SessionEventData {
    sessionId: string;
    action: 'start' | 'end' | 'pause' | 'resume';
    projectPath?: string;
    status?: string;
}
/**
 * Command event data
 */
export interface CommandEventData {
    command: string;
    args?: string;
    success: boolean;
    output?: string;
    error?: string;
}
/**
 * Generic Event - unified model for all observables
 */
export interface Event {
    /** Unique event identifier */
    id: string;
    /** ISO 8601 timestamp */
    timestamp: string;
    /** What generated this event */
    source: EventSource;
    /** Human-readable summary */
    summary: string;
    /** Source-specific payload */
    data: FileChangeData | ExecutorEventData | TaskEventData | SessionEventData | CommandEventData | Record<string, unknown>;
    /** Related entity IDs for tracing */
    relations: {
        taskId?: string;
        sessionId?: string;
        executorId?: string;
        parentEventId?: string;
    };
    /** Optional tags for filtering (not for category branching) */
    tags?: string[];
}
/**
 * Create a new event
 */
export declare function createEvent(source: EventSource, summary: string, data: Event['data'], relations?: Event['relations'], tags?: string[]): Event;
/**
 * Create a file change event
 */
export declare function createFileChangeEvent(path: string, status: FileChangeData['status'], options?: {
    oldPath?: string;
    diff?: string;
    taskId?: string;
    sessionId?: string;
}): Event;
/**
 * Create an executor event
 */
export declare function createExecutorEvent(executorId: string, action: ExecutorEventData['action'], options?: {
    taskId?: string;
    sessionId?: string;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    command?: string;
    durationMs?: number;
}): Event;
/**
 * Create a task event
 */
export declare function createTaskEvent(taskId: string, newStatus: string, options?: {
    previousStatus?: string;
    description?: string;
    sessionId?: string;
    filesModified?: string[];
    error?: {
        code: string;
        message: string;
    };
}): Event;
/**
 * Create a session event
 */
export declare function createSessionEvent(sessionId: string, action: SessionEventData['action'], options?: {
    projectPath?: string;
    status?: string;
}): Event;
/**
 * Create a command event
 */
export declare function createCommandEvent(command: string, success: boolean, options?: {
    args?: string;
    output?: string;
    error?: string;
    taskId?: string;
    sessionId?: string;
}): Event;
/**
 * Type guard for FileChangeData
 */
export declare function isFileChangeData(data: Event['data']): data is FileChangeData;
/**
 * Type guard for ExecutorEventData
 */
export declare function isExecutorEventData(data: Event['data']): data is ExecutorEventData;
/**
 * Type guard for TaskEventData
 */
export declare function isTaskEventData(data: Event['data']): data is TaskEventData;
/**
 * Type guard for SessionEventData
 */
export declare function isSessionEventData(data: Event['data']): data is SessionEventData;
/**
 * Type guard for CommandEventData
 */
export declare function isCommandEventData(data: Event['data']): data is CommandEventData;
//# sourceMappingURL=event.d.ts.map