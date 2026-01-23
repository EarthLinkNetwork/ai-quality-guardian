"use strict";
/**
 * TaskLog - Task Logging Models
 *
 * Per spec 05_DATA_MODELS.md Section "Task Log Structures"
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md
 *
 * Supports Thread/Run/Task hierarchy (v2.0)
 * Supports executor blocking fields (Property 34-36)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FULL_ONLY_EVENTS = exports.SUMMARY_VISIBLE_EVENTS = void 0;
exports.getEventVisibility = getEventVisibility;
exports.createTaskLogIndex = createTaskLogIndex;
exports.createTaskLog = createTaskLog;
exports.createThread = createThread;
exports.createRun = createRun;
exports.createSessionMetadata = createSessionMetadata;
exports.createGlobalLogIndex = createGlobalLogIndex;
exports.createLogEvent = createLogEvent;
exports.addEventToTaskLog = addEventToTaskLog;
exports.filterEventsByVisibility = filterEventsByVisibility;
/**
 * Summary-level event types (visible by default)
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 3.1
 * Per spec 25_REVIEW_LOOP.md Section 6.1
 */
exports.SUMMARY_VISIBLE_EVENTS = [
    'USER_INPUT',
    'USER_RESPONSE',
    'RUNNER_CLARIFICATION',
    'TASK_STARTED',
    'TASK_COMPLETED',
    'TASK_ERROR',
    // Review Loop events (summary level per spec/25_REVIEW_LOOP.md)
    'REVIEW_LOOP_START',
    'QUALITY_JUDGMENT',
    'REVIEW_LOOP_END',
    // Task Chunking events (summary level per spec/26_TASK_CHUNKING.md)
    'CHUNKING_START',
    'SUBTASK_START',
    'SUBTASK_COMPLETE',
    'SUBTASK_FAILED',
    'SUBTASK_RETRY',
    'CHUNKING_COMPLETE',
];
/**
 * Full-level event types (visible only with --full)
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 3.1
 * Per spec 25_REVIEW_LOOP.md Section 6.1
 */
exports.FULL_ONLY_EVENTS = [
    'LLM_MEDIATION_REQUEST',
    'LLM_MEDIATION_RESPONSE',
    'EXECUTOR_DISPATCH',
    'EXECUTOR_OUTPUT',
    'FILE_OPERATION',
    'TEST_EXECUTION',
    // Review Loop events (full level per spec/25_REVIEW_LOOP.md)
    'REVIEW_ITERATION_START',
    'REJECTION_DETAILS',
    'MODIFICATION_PROMPT',
    'REVIEW_ITERATION_END',
    // Task Chunking events (full level per spec/26_TASK_CHUNKING.md)
    'CHUNKING_ANALYSIS',
    'SUBTASK_CREATED',
    'CHUNKING_AGGREGATION',
];
/**
 * Get visibility level for an event type
 */
function getEventVisibility(eventType) {
    return exports.SUMMARY_VISIBLE_EVENTS.includes(eventType) ? 'summary' : 'full';
}
/**
 * Create initial TaskLogIndex
 */
function createTaskLogIndex(sessionId) {
    const now = new Date().toISOString();
    return {
        session_id: sessionId,
        created_at: now,
        updated_at: now,
        entries: [],
    };
}
/**
 * Create initial TaskLog with Thread/Run context
 */
function createTaskLog(taskId, sessionId, threadId = '', runId = '', parentTaskId = null) {
    return {
        task_id: taskId,
        session_id: sessionId,
        thread_id: threadId,
        run_id: runId,
        parent_task_id: parentTaskId,
        created_at: new Date().toISOString(),
        events: [],
        summary: {
            total_events: 0,
            summary_events: 0,
            full_events: 0,
            total_tokens_input: 0,
            total_tokens_output: 0,
            total_latency_ms: 0,
        },
        evidence_refs: [],
    };
}
/**
 * Create initial Thread
 */
function createThread(threadId, sessionId, threadType, description) {
    return {
        thread_id: threadId,
        session_id: sessionId,
        thread_type: threadType,
        created_at: new Date().toISOString(),
        description,
    };
}
/**
 * Create initial Run
 */
function createRun(runId, threadId, sessionId, trigger) {
    return {
        run_id: runId,
        thread_id: threadId,
        session_id: sessionId,
        started_at: new Date().toISOString(),
        completed_at: null,
        status: 'RUNNING',
        trigger,
    };
}
/**
 * Create initial SessionMetadata
 */
function createSessionMetadata(sessionId) {
    return {
        session_id: sessionId,
        started_at: new Date().toISOString(),
        threads: [],
        runs: [],
    };
}
/**
 * Create initial GlobalLogIndex
 */
function createGlobalLogIndex() {
    const now = new Date().toISOString();
    return {
        created_at: now,
        updated_at: now,
        sessions: [],
    };
}
/**
 * Create a LogEvent
 */
function createLogEvent(eventId, eventType, content, metadata) {
    return {
        event_id: eventId,
        timestamp: new Date().toISOString(),
        event_type: eventType,
        visibility_level: getEventVisibility(eventType),
        content,
        metadata,
    };
}
/**
 * Add event to TaskLog and update summary
 */
function addEventToTaskLog(log, event) {
    const events = [...log.events, event];
    const summary = {
        ...log.summary,
        total_events: log.summary.total_events + 1,
        summary_events: log.summary.summary_events + (event.visibility_level === 'summary' ? 1 : 0),
        full_events: log.summary.full_events + (event.visibility_level === 'full' ? 1 : 0),
        total_tokens_input: log.summary.total_tokens_input + (event.content.tokens_input || 0),
        total_tokens_output: log.summary.total_tokens_output + (event.content.tokens_output || 0),
        total_latency_ms: log.summary.total_latency_ms + (event.content.latency_ms || 0),
    };
    return {
        ...log,
        events,
        summary,
    };
}
/**
 * Filter events by visibility level
 */
function filterEventsByVisibility(events, level) {
    if (level === 'full') {
        return events; // Show all events
    }
    return events.filter(e => e.visibility_level === 'summary');
}
//# sourceMappingURL=task-log.js.map