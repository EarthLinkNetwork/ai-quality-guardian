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
export type LogEventType =
  | 'USER_INPUT'
  | 'RUNNER_CLARIFICATION'
  | 'USER_RESPONSE'
  | 'TASK_STARTED'
  | 'TASK_COMPLETED'
  | 'TASK_ERROR'
  | 'LLM_MEDIATION_REQUEST'
  | 'LLM_MEDIATION_RESPONSE'
  | 'EXECUTOR_DISPATCH'
  | 'EXECUTOR_OUTPUT'
  | 'FILE_OPERATION'
  | 'TEST_EXECUTION';

/**
 * Summary-level event types (visible by default)
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 3.1
 */
export const SUMMARY_VISIBLE_EVENTS: LogEventType[] = [
  'USER_INPUT',
  'USER_RESPONSE',
  'RUNNER_CLARIFICATION',
  'TASK_STARTED',
  'TASK_COMPLETED',
  'TASK_ERROR',
];

/**
 * Full-level event types (visible only with --full)
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 3.1
 */
export const FULL_ONLY_EVENTS: LogEventType[] = [
  'LLM_MEDIATION_REQUEST',
  'LLM_MEDIATION_RESPONSE',
  'EXECUTOR_DISPATCH',
  'EXECUTOR_OUTPUT',
  'FILE_OPERATION',
  'TEST_EXECUTION',
];

/**
 * Get visibility level for an event type
 */
export function getEventVisibility(eventType: LogEventType): VisibilityLevel {
  return SUMMARY_VISIBLE_EVENTS.includes(eventType) ? 'summary' : 'full';
}

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
  threads: Array<{ thread_id: string; thread_type: ThreadType }>;
  runs: Array<{ run_id: string; thread_id: string; status: RunStatus }>;
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
  // Common fields
  text?: string;
  
  // RUNNER_CLARIFICATION specific
  question?: string;
  clarification_reason?: string;
  
  // TASK_STARTED specific
  action?: string;
  target_file?: string;
  
  // TASK_COMPLETED / TASK_ERROR specific
  status?: string;
  files_modified?: string[];
  evidence_ref?: string;
  error_message?: string;
  
  // LLM_MEDIATION_REQUEST specific
  provider?: string;
  model?: string;
  prompt_summary?: string;
  tokens_input?: number;
  
  // LLM_MEDIATION_RESPONSE specific
  response_type?: string;
  tokens_output?: number;
  latency_ms?: number;
  
  // EXECUTOR_DISPATCH specific
  executor?: string;
  task_summary?: string;
  
  // EXECUTOR_OUTPUT specific
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
export function createTaskLogIndex(sessionId: string): TaskLogIndex {
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
export function createTaskLog(
  taskId: string,
  sessionId: string,
  threadId: string = '',
  runId: string = '',
  parentTaskId: string | null = null
): TaskLog {
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
export function createThread(
  threadId: string,
  sessionId: string,
  threadType: ThreadType,
  description?: string
): Thread {
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
export function createRun(
  runId: string,
  threadId: string,
  sessionId: string,
  trigger: RunTrigger
): Run {
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
export function createSessionMetadata(sessionId: string): SessionMetadata {
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
export function createGlobalLogIndex(): GlobalLogIndex {
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
export function createLogEvent(
  eventId: string,
  eventType: LogEventType,
  content: LogEventContent,
  metadata?: Record<string, unknown>
): LogEvent {
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
export function addEventToTaskLog(log: TaskLog, event: LogEvent): TaskLog {
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
export function filterEventsByVisibility(events: LogEvent[], level: VisibilityLevel): LogEvent[] {
  if (level === 'full') {
    return events; // Show all events
  }
  return events.filter(e => e.visibility_level === 'summary');
}
