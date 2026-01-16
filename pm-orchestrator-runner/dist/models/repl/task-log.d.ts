/**
 * TaskLog - Task Logging Models
 *
 * Per spec 05_DATA_MODELS.md Section "Task Log Structures"
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md
 *
 * Supports Thread/Run/Task hierarchy (v2.0)
 * Supports executor blocking fields (Property 34-36)
 */
import type { BlockedReason, TerminatedBy } from '../enums';
/**
 * Visibility levels for log display
 * Per spec 05_DATA_MODELS.md
 */
export type VisibilityLevel = 'summary' | 'full';
/**
 * Thread types
 * Per spec 05_DATA_MODELS.md Section "ThreadType"
 */
export type ThreadType = 'main' | 'background' | 'system';
/**
 * Run status
 * Per spec 05_DATA_MODELS.md Section "RunStatus"
 */
export type RunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
/**
 * Run trigger
 * Per spec 05_DATA_MODELS.md Section "RunTrigger"
 */
export type RunTrigger = 'USER_INPUT' | 'USER_RESPONSE' | 'CONTINUATION' | 'EXECUTOR';
/**
 * Log event types
 * Per spec 05_DATA_MODELS.md
 */
export type LogEventType = 'USER_INPUT' | 'RUNNER_CLARIFICATION' | 'USER_RESPONSE' | 'TASK_STARTED' | 'TASK_COMPLETED' | 'TASK_ERROR' | 'LLM_MEDIATION_REQUEST' | 'LLM_MEDIATION_RESPONSE' | 'EXECUTOR_DISPATCH' | 'EXECUTOR_OUTPUT' | 'FILE_OPERATION' | 'TEST_EXECUTION';
/**
 * Summary-level event types (visible by default)
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 3.1
 */
export declare const SUMMARY_VISIBLE_EVENTS: LogEventType[];
/**
 * Full-level event types (visible only with --full)
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 3.1
 */
export declare const FULL_ONLY_EVENTS: LogEventType[];
/**
 * Get visibility level for an event type
 */
export declare function getEventVisibility(eventType: LogEventType): VisibilityLevel;
/**
 * Thread structure
 * Per spec 05_DATA_MODELS.md Section "Thread"
 */
export interface Thread {
    thread_id: string;
    session_id: string;
    thread_type: ThreadType;
    created_at: string;
    description?: string;
}
/**
 * Run structure
 * Per spec 05_DATA_MODELS.md Section "Run"
 */
export interface Run {
    run_id: string;
    thread_id: string;
    session_id: string;
    started_at: string;
    completed_at: string | null;
    status: RunStatus;
    trigger: RunTrigger;
}
/**
 * Session metadata structure
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 1.2
 */
export interface SessionMetadata {
    session_id: string;
    started_at: string;
    threads: Array<{
        thread_id: string;
        thread_type: ThreadType;
    }>;
    runs: Array<{
        run_id: string;
        thread_id: string;
        status: RunStatus;
    }>;
}
/**
 * Global index structure
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 1.1
 */
export interface GlobalLogIndex {
    created_at: string;
    updated_at: string;
    sessions: Array<{
        session_id: string;
        started_at: string;
        task_count: number;
    }>;
}
/**
 * LogEvent content structure
 * Per spec 05_DATA_MODELS.md
 */
export interface LogEventContent {
    text?: string;
    question?: string;
    clarification_reason?: string;
    action?: string;
    target_file?: string;
    status?: string;
    files_modified?: string[];
    evidence_ref?: string;
    error_message?: string;
    provider?: string;
    model?: string;
    prompt_summary?: string;
    tokens_input?: number;
    response_type?: string;
    tokens_output?: number;
    latency_ms?: number;
    executor?: string;
    task_summary?: string;
    exit_code?: number;
    output_summary?: string;
    raw_output_ref?: string;
}
/**
 * LogEvent structure
 * Per spec 05_DATA_MODELS.md
 */
export interface LogEvent {
    event_id: string;
    timestamp: string;
    event_type: LogEventType;
    visibility_level: VisibilityLevel;
    content: LogEventContent;
    metadata?: Record<string, unknown>;
}
/**
 * TaskLogSummary structure
 * Per spec 05_DATA_MODELS.md
 */
export interface TaskLogSummary {
    total_events: number;
    summary_events: number;
    full_events: number;
    total_tokens_input: number;
    total_tokens_output: number;
    total_latency_ms: number;
}
/**
 * TaskLog structure with Thread/Run context
 * Per spec 05_DATA_MODELS.md
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md - Property 34-36 executor blocking fields
 */
export interface TaskLog {
    task_id: string;
    session_id: string;
    thread_id: string;
    run_id: string;
    parent_task_id: string | null;
    created_at: string;
    events: LogEvent[];
    summary: TaskLogSummary;
    evidence_refs: string[];
    /** Executor blocked in non-interactive mode (Property 34-36) */
    executor_blocked?: boolean;
    /** Blocking reason - required when executor_blocked is true */
    blocked_reason?: BlockedReason;
    /** Time until blocking was detected (ms) - required when executor_blocked is true */
    timeout_ms?: number;
    /** How the executor was terminated - required when executor_blocked is true */
    terminated_by?: TerminatedBy;
}
/**
 * TaskLogEntry structure (for index) with hierarchy fields
 * Per spec 05_DATA_MODELS.md
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md - Property 34-36 executor blocking fields
 * Per redesign: includes description and executor_mode for visibility
 */
export interface TaskLogEntry {
    task_id: string;
    thread_id: string;
    run_id: string;
    parent_task_id: string | null;
    status: string;
    started_at: string;
    completed_at: string | null;
    duration_ms: number;
    files_modified_count: number;
    tests_run_count: number;
    log_file: string;
    /** Task description/prompt summary (per redesign: visibility) */
    description?: string;
    /** Executor mode used (per redesign: visibility) */
    executor_mode?: string;
    /** Files that were modified (per redesign: visibility) */
    files_modified?: string[];
    /** Response summary from executor (per redesign: visibility) */
    response_summary?: string;
    /** Executor blocked in non-interactive mode (Property 34-36) */
    executor_blocked?: boolean;
    /** Blocking reason - required when executor_blocked is true */
    blocked_reason?: BlockedReason;
}
/**
 * TaskLogIndex structure
 * Per spec 05_DATA_MODELS.md
 */
export interface TaskLogIndex {
    session_id: string;
    created_at: string;
    updated_at: string;
    entries: TaskLogEntry[];
}
/**
 * Create initial TaskLogIndex
 */
export declare function createTaskLogIndex(sessionId: string): TaskLogIndex;
/**
 * Create initial TaskLog with Thread/Run context
 */
export declare function createTaskLog(taskId: string, sessionId: string, threadId?: string, runId?: string, parentTaskId?: string | null): TaskLog;
/**
 * Create initial Thread
 */
export declare function createThread(threadId: string, sessionId: string, threadType: ThreadType, description?: string): Thread;
/**
 * Create initial Run
 */
export declare function createRun(runId: string, threadId: string, sessionId: string, trigger: RunTrigger): Run;
/**
 * Create initial SessionMetadata
 */
export declare function createSessionMetadata(sessionId: string): SessionMetadata;
/**
 * Create initial GlobalLogIndex
 */
export declare function createGlobalLogIndex(): GlobalLogIndex;
/**
 * Create a LogEvent
 */
export declare function createLogEvent(eventId: string, eventType: LogEventType, content: LogEventContent, metadata?: Record<string, unknown>): LogEvent;
/**
 * Add event to TaskLog and update summary
 */
export declare function addEventToTaskLog(log: TaskLog, event: LogEvent): TaskLog;
/**
 * Filter events by visibility level
 */
export declare function filterEventsByVisibility(events: LogEvent[], level: VisibilityLevel): LogEvent[];
//# sourceMappingURL=task-log.d.ts.map