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

import { v4 as uuidv4 } from 'uuid';

/**
 * Event source type - what generated this event
 */
export type EventSource =
  | 'file_change'      // File diff (src, dist, docs, etc.)
  | 'executor'         // Executor start/end
  | 'task'             // Task state transition
  | 'session'          // Session start/end
  | 'command'          // REPL command execution
  | 'system';          // System-level events

/**
 * File change details
 */
export interface FileChangeData {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  oldPath?: string;  // For renames
  diff?: string;     // Git diff output (optional, can be large)
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
  error?: { code: string; message: string };
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
  data:
    | FileChangeData
    | ExecutorEventData
    | TaskEventData
    | SessionEventData
    | CommandEventData
    | Record<string, unknown>;  // For system/custom events

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
export function createEvent(
  source: EventSource,
  summary: string,
  data: Event['data'],
  relations?: Event['relations'],
  tags?: string[]
): Event {
  return {
    id: `evt-${uuidv4()}`,
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
export function createFileChangeEvent(
  path: string,
  status: FileChangeData['status'],
  options?: {
    oldPath?: string;
    diff?: string;
    taskId?: string;
    sessionId?: string;
  }
): Event {
  const data: FileChangeData = {
    path,
    status,
    oldPath: options?.oldPath,
    diff: options?.diff,
  };

  return createEvent(
    'file_change',
    `File ${status}: ${path}`,
    data,
    {
      taskId: options?.taskId,
      sessionId: options?.sessionId,
    }
  );
}

/**
 * Create an executor event
 */
export function createExecutorEvent(
  executorId: string,
  action: ExecutorEventData['action'],
  options?: {
    taskId?: string;
    sessionId?: string;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    command?: string;
    durationMs?: number;
  }
): Event {
  const data: ExecutorEventData = {
    executorId,
    action,
    taskId: options?.taskId,
    stdout: options?.stdout,
    stderr: options?.stderr,
    exitCode: options?.exitCode,
    command: options?.command,
    durationMs: options?.durationMs,
  };

  const summary =
    action === 'start'
      ? `Executor ${executorId} started`
      : action === 'end'
        ? `Executor ${executorId} ended (exit: ${options?.exitCode ?? 'unknown'})`
        : action === 'error'
          ? `Executor ${executorId} error`
          : `Executor ${executorId} output`;

  return createEvent(
    'executor',
    summary,
    data,
    {
      taskId: options?.taskId,
      sessionId: options?.sessionId,
      executorId,
    }
  );
}

/**
 * Create a task event
 */
export function createTaskEvent(
  taskId: string,
  newStatus: string,
  options?: {
    previousStatus?: string;
    description?: string;
    sessionId?: string;
    filesModified?: string[];
    error?: { code: string; message: string };
  }
): Event {
  const data: TaskEventData = {
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

  return createEvent(
    'task',
    summary,
    data,
    {
      taskId,
      sessionId: options?.sessionId,
    }
  );
}

/**
 * Create a session event
 */
export function createSessionEvent(
  sessionId: string,
  action: SessionEventData['action'],
  options?: {
    projectPath?: string;
    status?: string;
  }
): Event {
  const data: SessionEventData = {
    sessionId,
    action,
    projectPath: options?.projectPath,
    status: options?.status,
  };

  return createEvent(
    'session',
    `Session ${sessionId} ${action}`,
    data,
    { sessionId }
  );
}

/**
 * Create a command event
 */
export function createCommandEvent(
  command: string,
  success: boolean,
  options?: {
    args?: string;
    output?: string;
    error?: string;
    taskId?: string;
    sessionId?: string;
  }
): Event {
  const data: CommandEventData = {
    command,
    args: options?.args,
    success,
    output: options?.output,
    error: options?.error,
  };

  return createEvent(
    'command',
    `Command: ${command}${options?.args ? ' ' + options.args : ''} (${success ? 'success' : 'failed'})`,
    data,
    {
      taskId: options?.taskId,
      sessionId: options?.sessionId,
    }
  );
}

/**
 * Type guard for FileChangeData
 */
export function isFileChangeData(data: Event['data']): data is FileChangeData {
  return 'path' in data && 'status' in data;
}

/**
 * Type guard for ExecutorEventData
 */
export function isExecutorEventData(data: Event['data']): data is ExecutorEventData {
  return 'executorId' in data && 'action' in data;
}

/**
 * Type guard for TaskEventData
 */
export function isTaskEventData(data: Event['data']): data is TaskEventData {
  return 'taskId' in data && 'newStatus' in data;
}

/**
 * Type guard for SessionEventData
 */
export function isSessionEventData(data: Event['data']): data is SessionEventData {
  return 'sessionId' in data && 'action' in data;
}

/**
 * Type guard for CommandEventData
 */
export function isCommandEventData(data: Event['data']): data is CommandEventData {
  return 'command' in data && 'success' in data;
}
