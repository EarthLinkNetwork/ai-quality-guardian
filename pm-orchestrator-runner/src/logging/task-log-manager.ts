/**
 * Task Log Manager
 *
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md:
 * - Logs stored in .claude/logs/sessions/<session_id>/
 * - Two-layer viewing (list and detail)
 * - Visibility control (summary/full)
 * - Thread/Run/Task hierarchy support (v2.0)
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  TaskLog,
  TaskLogIndex,
  TaskLogEntry,
  LogEvent,
  LogEventType,
  LogEventContent,
  VisibilityLevel,
  Thread,
  Run,
  RunTrigger,
  RunStatus,
  ThreadType,
  SessionMetadata,
  GlobalLogIndex,
  createTaskLogIndex,
  createTaskLog,
  createLogEvent,
  addEventToTaskLog,
  filterEventsByVisibility,
  createThread,
  createRun,
  createSessionMetadata,
  createGlobalLogIndex,
} from '../models/repl/task-log';
import type { BlockedReason, TerminatedBy } from '../models/enums';
import { maskSensitiveData, maskSensitiveObject } from './sensitive-data-masker';

/**
 * Options for completing a task
 * Per spec 10_REPL_UX.md Section 10: Executor blocking fields (Property 34-36)
 * Per redesign: Visibility fields for task description, executor mode, and response
 */
export interface CompleteTaskOptions {
  filesModified?: string[];
  evidenceRef?: string;
  errorMessage?: string;
  /** Executor blocked in non-interactive mode */
  executorBlocked?: boolean;
  /** Blocking reason */
  blockedReason?: BlockedReason;
  /** Time until blocking was detected (ms) */
  timeoutMs?: number;
  /** How the executor was terminated */
  terminatedBy?: TerminatedBy;
  /** Task description/prompt summary (per redesign: visibility) */
  description?: string;
  /** Executor mode used (per redesign: visibility) */
  executorMode?: string;
  /** Response summary from executor (per redesign: visibility) */
  responseSummary?: string;
}

/**
 * Log directory structure
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 1.1
 */
const LOG_DIR = 'logs';
const SESSIONS_DIR = 'sessions';
const TASKS_DIR = 'tasks';
const RAW_DIR = 'raw';
const INDEX_FILE = 'index.json';
const SESSION_FILE = 'session.json';

/**
 * Task Log Manager class
 * Supports Thread/Run/Task hierarchy (v2.0)
 */
export class TaskLogManager {
  private readonly projectPath: string;
  private readonly logsPath: string;
  
  // Session-scoped counters for sequential IDs
  private threadCounters: Map<string, number> = new Map();
  private runCounters: Map<string, number> = new Map();
  private taskCounters: Map<string, number> = new Map();

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.logsPath = path.join(projectPath, '.claude', LOG_DIR);
  }

  /**
   * Get session directory path
   */
  private getSessionPath(sessionId: string): string {
    return path.join(this.logsPath, SESSIONS_DIR, sessionId);
  }

  /**
   * Get session tasks directory path
   */
  private getSessionTasksPath(sessionId: string): string {
    return path.join(this.getSessionPath(sessionId), TASKS_DIR);
  }

  /**
   * Ensure log directories exist (legacy support)
   * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 1.3
   */
  async ensureLogDirectories(): Promise<void> {
    const dirs = [
      this.logsPath,
      path.join(this.logsPath, SESSIONS_DIR),
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Ensure session-based directories exist
   * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 1.1
   */
  async ensureSessionDirectories(sessionId: string): Promise<void> {
    await this.ensureLogDirectories();
    
    const sessionPath = this.getSessionPath(sessionId);
    const tasksPath = this.getSessionTasksPath(sessionId);
    const rawPath = path.join(sessionPath, RAW_DIR);

    const dirs = [sessionPath, tasksPath, rawPath];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Initialize a new session
   * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 1.2
   */
  async initializeSession(sessionId: string): Promise<SessionMetadata> {
    await this.ensureSessionDirectories(sessionId);
    
    // Initialize counters for this session
    this.threadCounters.set(sessionId, 0);
    this.runCounters.set(sessionId, 0);
    this.taskCounters.set(sessionId, 0);
    
    // Create session metadata
    const sessionMeta = createSessionMetadata(sessionId);
    const sessionMetaPath = path.join(this.getSessionPath(sessionId), SESSION_FILE);
    fs.writeFileSync(sessionMetaPath, JSON.stringify(sessionMeta, null, 2), 'utf-8');
    
    // Create session index
    const sessionIndex = createTaskLogIndex(sessionId);
    const sessionIndexPath = path.join(this.getSessionPath(sessionId), INDEX_FILE);
    fs.writeFileSync(sessionIndexPath, JSON.stringify(sessionIndex, null, 2), 'utf-8');
    
    // Update global index
    await this.updateGlobalIndex(sessionId);
    
    return sessionMeta;
  }

  /**
   * Update global index with new session
   */
  private async updateGlobalIndex(sessionId: string): Promise<void> {
    const globalIndexPath = path.join(this.logsPath, INDEX_FILE);
    
    let globalIndex: GlobalLogIndex;
    if (fs.existsSync(globalIndexPath)) {
      try {
        const content = fs.readFileSync(globalIndexPath, 'utf-8');
        globalIndex = JSON.parse(content) as GlobalLogIndex;
      } catch {
        globalIndex = createGlobalLogIndex();
      }
    } else {
      globalIndex = createGlobalLogIndex();
    }
    
    // Add session if not already present
    if (!globalIndex.sessions.some(s => s.session_id === sessionId)) {
      globalIndex.sessions.push({
        session_id: sessionId,
        started_at: new Date().toISOString(),
        task_count: 0,
      });
    }
    
    globalIndex.updated_at = new Date().toISOString();
    fs.writeFileSync(globalIndexPath, JSON.stringify(globalIndex, null, 2), 'utf-8');
  }

  /**
   * Get session metadata
   */
  async getSessionMetadata(sessionId: string): Promise<SessionMetadata> {
    const sessionMetaPath = path.join(this.getSessionPath(sessionId), SESSION_FILE);
    
    if (!fs.existsSync(sessionMetaPath)) {
      return createSessionMetadata(sessionId);
    }
    
    try {
      const content = fs.readFileSync(sessionMetaPath, 'utf-8');
      return JSON.parse(content) as SessionMetadata;
    } catch {
      return createSessionMetadata(sessionId);
    }
  }

  /**
   * Save session metadata
   */
  private async saveSessionMetadata(sessionId: string, metadata: SessionMetadata): Promise<void> {
    const sessionMetaPath = path.join(this.getSessionPath(sessionId), SESSION_FILE);
    fs.writeFileSync(sessionMetaPath, JSON.stringify(metadata, null, 2), 'utf-8');
  }

  /**
   * Get session index
   */
  async getSessionIndex(sessionId: string): Promise<TaskLogIndex> {
    const sessionIndexPath = path.join(this.getSessionPath(sessionId), INDEX_FILE);
    
    if (!fs.existsSync(sessionIndexPath)) {
      return createTaskLogIndex(sessionId);
    }
    
    try {
      const content = fs.readFileSync(sessionIndexPath, 'utf-8');
      return JSON.parse(content) as TaskLogIndex;
    } catch {
      // Per spec: On corruption, return empty entries
      return createTaskLogIndex(sessionId);
    }
  }

  /**
   * Save session index
   */
  private async saveSessionIndex(sessionId: string, index: TaskLogIndex): Promise<void> {
    const sessionIndexPath = path.join(this.getSessionPath(sessionId), INDEX_FILE);
    index.updated_at = new Date().toISOString();
    fs.writeFileSync(sessionIndexPath, JSON.stringify(maskSensitiveObject(index), null, 2), 'utf-8');
  }

  /**
   * Generate next thread ID for session
   */
  private generateThreadId(sessionId: string): string {
    const current = this.threadCounters.get(sessionId) ?? 0;
    const next = current + 1;
    this.threadCounters.set(sessionId, next);
    return 'thr-' + String(next).padStart(3, '0');
  }

  /**
   * Generate next run ID for session
   */
  private generateRunId(sessionId: string): string {
    const current = this.runCounters.get(sessionId) ?? 0;
    const next = current + 1;
    this.runCounters.set(sessionId, next);
    return 'run-' + String(next).padStart(3, '0');
  }

  /**
   * Generate next task ID for session
   */
  private generateTaskId(sessionId: string): string {
    const current = this.taskCounters.get(sessionId) ?? 0;
    const next = current + 1;
    this.taskCounters.set(sessionId, next);
    return 'task-' + String(next).padStart(3, '0');
  }

  /**
   * Create a new thread
   * Per spec 05_DATA_MODELS.md Section "Thread"
   */
  async createThread(
    sessionId: string,
    threadType: ThreadType,
    description?: string
  ): Promise<Thread> {
    const threadId = this.generateThreadId(sessionId);
    const thread = createThread(threadId, sessionId, threadType, description);
    
    // Add to session metadata
    const metadata = await this.getSessionMetadata(sessionId);
    metadata.threads.push({ thread_id: threadId, thread_type: threadType });
    await this.saveSessionMetadata(sessionId, metadata);
    
    return thread;
  }

  /**
   * Create a new run
   * Per spec 05_DATA_MODELS.md Section "Run"
   */
  async createRun(
    sessionId: string,
    threadId: string,
    trigger: RunTrigger
  ): Promise<Run> {
    const runId = this.generateRunId(sessionId);
    const run = createRun(runId, threadId, sessionId, trigger);
    
    // Add to session metadata
    const metadata = await this.getSessionMetadata(sessionId);
    metadata.runs.push({ run_id: runId, thread_id: threadId, status: 'RUNNING' });
    await this.saveSessionMetadata(sessionId, metadata);
    
    return run;
  }

  /**
   * Get a run by ID
   */
  async getRun(sessionId: string, runId: string): Promise<Run | null> {
    const metadata = await this.getSessionMetadata(sessionId);
    const runInfo = metadata.runs.find(r => r.run_id === runId);
    
    if (!runInfo) {
      return null;
    }
    
    // Reconstruct run from metadata (simplified)
    return {
      run_id: runId,
      thread_id: runInfo.thread_id,
      session_id: sessionId,
      started_at: metadata.started_at,
      completed_at: runInfo.status !== 'RUNNING' ? new Date().toISOString() : null,
      status: runInfo.status,
      trigger: 'USER_INPUT', // Default, actual trigger not stored in minimal metadata
    };
  }

  /**
   * Complete a run
   */
  async completeRun(sessionId: string, runId: string, status: RunStatus): Promise<void> {
    const metadata = await this.getSessionMetadata(sessionId);
    const runInfo = metadata.runs.find(r => r.run_id === runId);

    if (runInfo) {
      runInfo.status = status;
      await this.saveSessionMetadata(sessionId, metadata);
    }
  }

  /**
   * Complete a task with session context
   * Per spec 06_CORRECTNESS_PROPERTIES.md Property 26: Fail-Closed Logging
   * TaskLog MUST be saved for ALL terminal states (COMPLETE, INCOMPLETE, ERROR)
   * Per spec 10_REPL_UX.md Section 10: Records executor blocking info (Property 34-36)
   */
  async completeTaskWithSession(
    taskId: string,
    sessionId: string,
    status: 'COMPLETE' | 'INCOMPLETE' | 'ERROR',
    filesModified: string[] = [],
    evidenceRef?: string,
    errorMessage?: string,
    options?: CompleteTaskOptions
  ): Promise<void> {
    const log = await this.getTaskLogWithSession(taskId, sessionId);
    if (!log) {
      throw new Error('Task log not found: ' + taskId);
    }

    // Per spec 10_REPL_UX.md Section 10: Record executor blocking info (Property 34-36)
    // Update TaskLog with executor_blocked fields if provided
    if (options?.executorBlocked !== undefined) {
      log.executor_blocked = options.executorBlocked;
      log.blocked_reason = options.blockedReason;
      log.timeout_ms = options.timeoutMs;
      log.terminated_by = options.terminatedBy;
      await this.saveTaskLogWithSession(log, sessionId);
    }

    // Add completion event
    const eventType: LogEventType = status === 'ERROR' ? 'TASK_ERROR' : 'TASK_COMPLETED';
    await this.addEventWithSession(taskId, sessionId, eventType, {
      status,
      files_modified: filesModified,
      evidence_ref: evidenceRef,
      error_message: errorMessage,
    });

    // Update session index entry
    const index = await this.getSessionIndex(sessionId);
    const entry = index.entries.find(e => e.task_id === taskId);
    if (entry) {
      entry.status = status;
      entry.completed_at = new Date().toISOString();
      entry.duration_ms = new Date(entry.completed_at).getTime() - new Date(entry.started_at).getTime();
      entry.files_modified_count = filesModified.length;
      // Per spec 10_REPL_UX.md Section 10: Record executor blocking info in index (Property 34-36)
      if (options?.executorBlocked !== undefined) {
        entry.executor_blocked = options.executorBlocked;
        entry.blocked_reason = options.blockedReason;
      }
      // Per redesign: Record visibility fields
      if (options?.description) {
        entry.description = options.description;
      }
      if (options?.executorMode) {
        entry.executor_mode = options.executorMode;
      }
      if (filesModified.length > 0) {
        entry.files_modified = filesModified;
      }
      if (options?.responseSummary) {
        entry.response_summary = options.responseSummary;
      }
    }
    await this.saveSessionIndex(sessionId, index);
  }

  /**
   * Create a task with thread/run context
   * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 2.3
   *
   * @param sessionId - Session ID
   * @param threadId - Thread ID
   * @param runId - Run ID
   * @param parentTaskId - Optional parent task ID
   * @param externalTaskId - Optional external task ID (from REPL). If provided, use this instead of generating.
   */
  async createTaskWithContext(
    sessionId: string,
    threadId: string,
    runId: string,
    parentTaskId?: string,
    externalTaskId?: string
  ): Promise<TaskLog> {
    await this.ensureSessionDirectories(sessionId);

    // Validate parent task is in same thread if specified
    if (parentTaskId) {
      const parentLog = await this.getTaskLogWithSession(parentTaskId, sessionId);
      if (parentLog && parentLog.thread_id !== threadId) {
        throw new Error('parent_task_id must be within same thread');
      }
    }

    // Use external task ID if provided (from REPL), otherwise generate
    const taskId = externalTaskId || this.generateTaskId(sessionId);
    const log = createTaskLog(taskId, sessionId, threadId, runId, parentTaskId ?? null);
    
    await this.saveTaskLogWithSession(log, sessionId);
    
    // Update session index
    const index = await this.getSessionIndex(sessionId);
    const entry: TaskLogEntry = {
      task_id: taskId,
      thread_id: threadId,
      run_id: runId,
      parent_task_id: parentTaskId ?? null,
      status: 'RUNNING',
      started_at: log.created_at,
      completed_at: null,
      duration_ms: 0,
      files_modified_count: 0,
      tests_run_count: 0,
      log_file: path.join(TASKS_DIR, taskId + '.json'),
    };
    index.entries.push(entry);
    await this.saveSessionIndex(sessionId, index);
    
    // Update global index task count
    await this.incrementGlobalTaskCount(sessionId);
    
    return log;
  }

  /**
   * Increment task count in global index
   */
  private async incrementGlobalTaskCount(sessionId: string): Promise<void> {
    const globalIndexPath = path.join(this.logsPath, INDEX_FILE);
    
    if (fs.existsSync(globalIndexPath)) {
      try {
        const content = fs.readFileSync(globalIndexPath, 'utf-8');
        const globalIndex = JSON.parse(content) as GlobalLogIndex;
        const session = globalIndex.sessions.find(s => s.session_id === sessionId);
        if (session) {
          session.task_count++;
          globalIndex.updated_at = new Date().toISOString();
          fs.writeFileSync(globalIndexPath, JSON.stringify(globalIndex, null, 2), 'utf-8');
        }
      } catch {
        // Ignore errors in global index update
      }
    }
  }

  /**
   * Get task log with session context
   */
  async getTaskLogWithSession(taskId: string, sessionId: string): Promise<TaskLog | null> {
    const logPath = path.join(this.getSessionTasksPath(sessionId), taskId + '.json');
    
    if (!fs.existsSync(logPath)) {
      return null;
    }
    
    try {
      const content = fs.readFileSync(logPath, 'utf-8');
      return JSON.parse(content) as TaskLog;
    } catch {
      return null;
    }
  }

  /**
   * Save task log with session context
   */
  private async saveTaskLogWithSession(log: TaskLog, sessionId: string): Promise<void> {
    await this.ensureSessionDirectories(sessionId);
    const logPath = path.join(this.getSessionTasksPath(sessionId), log.task_id + '.json');
    
    // Mask sensitive data before saving
    const maskedLog = maskSensitiveObject(log);
    fs.writeFileSync(logPath, JSON.stringify(maskedLog, null, 2), 'utf-8');
  }

  /**
   * Add event to task log with session context
   */
  async addEventWithSession(
    taskId: string,
    sessionId: string,
    eventType: LogEventType,
    content: LogEventContent,
    metadata?: Record<string, unknown>
  ): Promise<LogEvent> {
    const log = await this.getTaskLogWithSession(taskId, sessionId);
    if (!log) {
      throw new Error('Task log not found: ' + taskId);
    }
    
    const eventId = 'evt-' + String(log.events.length + 1).padStart(3, '0');
    const event = createLogEvent(eventId, eventType, content, metadata);
    
    const updatedLog = addEventToTaskLog(log, event);
    await this.saveTaskLogWithSession(updatedLog, sessionId);
    
    return event;
  }

  /**
   * Get task detail with session context
   * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 2.2
   */
  async getTaskDetailWithSession(
    taskId: string,
    sessionId: string,
    visibility: VisibilityLevel = 'summary'
  ): Promise<{ log: TaskLog | null; events: LogEvent[] }> {
    const log = await this.getTaskLogWithSession(taskId, sessionId);
    if (!log) {
      return { log: null, events: [] };
    }
    
    const events = filterEventsByVisibility(log.events, visibility);
    
    // Mask any remaining sensitive data in display
    const maskedEvents = events.map(e => ({
      ...e,
      content: maskSensitiveObject(e.content),
    }));
    
    return { log, events: maskedEvents };
  }

  /**
   * Format tree view of session hierarchy
   * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 2.5
   */
  async formatTreeView(sessionId: string): Promise<string> {
    const metadata = await this.getSessionMetadata(sessionId);
    const index = await this.getSessionIndex(sessionId);
    
    let output = 'Session: ' + sessionId + '\n';
    output += 'Started: ' + metadata.started_at + '\n\n';
    
    // Group tasks by thread and run
    for (const threadInfo of metadata.threads) {
      output += '  Thread: ' + threadInfo.thread_id + ' (' + threadInfo.thread_type + ')\n';
      
      // Find runs for this thread
      const threadRuns = metadata.runs.filter(r => r.thread_id === threadInfo.thread_id);
      
      for (const runInfo of threadRuns) {
        output += '    Run: ' + runInfo.run_id + ' [' + runInfo.status + ']\n';
        
        // Find tasks for this run
        const runTasks = index.entries.filter(e => e.run_id === runInfo.run_id);
        
        for (const task of runTasks) {
          const indent = task.parent_task_id ? '        ' : '      ';
          output += indent + 'Task: ' + task.task_id + ' [' + task.status + ']\n';
        }
      }
    }
    
    return output;
  }

  // ========================================
  // Legacy methods for backward compatibility
  // ========================================

  /**
   * Get or create log index (legacy)
   */
  async getOrCreateIndex(sessionId: string): Promise<TaskLogIndex> {
    await this.ensureLogDirectories();
    // Fixed: Read session-specific index, not global index
    const indexPath = path.join(this.getSessionPath(sessionId), INDEX_FILE);

    if (fs.existsSync(indexPath)) {
      try {
        const content = fs.readFileSync(indexPath, 'utf-8');
        return JSON.parse(content) as TaskLogIndex;
      } catch {
        // Per spec: On corruption, return empty list
        return createTaskLogIndex(sessionId);
      }
    }

    return createTaskLogIndex(sessionId);
  }

  /**
   * Save log index (legacy)
   */
  async saveIndex(index: TaskLogIndex): Promise<void> {
    await this.ensureLogDirectories();
    // Fixed: Save to session-specific index, not global index
    const indexPath = path.join(this.getSessionPath(index.session_id), INDEX_FILE);
    
    // Mask any sensitive data before saving
    const maskedIndex = maskSensitiveObject(index);
    maskedIndex.updated_at = new Date().toISOString();
    
    fs.writeFileSync(indexPath, JSON.stringify(maskedIndex, null, 2), 'utf-8');
  }

  /**
   * Create a new task log (legacy - without thread/run context)
   */
  async createTask(taskId: string, sessionId: string): Promise<TaskLog> {
    await this.ensureLogDirectories();
    const log = createTaskLog(taskId, sessionId);
    await this.saveTaskLog(log);
    
    // Update index
    const index = await this.getOrCreateIndex(sessionId);
    const entry: TaskLogEntry = {
      task_id: taskId,
      thread_id: '',
      run_id: '',
      parent_task_id: null,
      status: 'RUNNING',
      started_at: log.created_at,
      completed_at: null,
      duration_ms: 0,
      files_modified_count: 0,
      tests_run_count: 0,
      log_file: path.join(TASKS_DIR, taskId + '.json'),
    };
    index.entries.push(entry);
    await this.saveIndex(index);
    
    return log;
  }

  /**
   * Get task log by ID (legacy)
   */
  async getTaskLog(taskId: string): Promise<TaskLog | null> {
    const logPath = path.join(this.logsPath, TASKS_DIR, taskId + '.json');
    
    if (!fs.existsSync(logPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(logPath, 'utf-8');
      return JSON.parse(content) as TaskLog;
    } catch {
      return null;
    }
  }

  /**
   * Save task log (legacy)
   */
  async saveTaskLog(log: TaskLog): Promise<void> {
    await this.ensureLogDirectories();
    const tasksDir = path.join(this.logsPath, TASKS_DIR);
    if (!fs.existsSync(tasksDir)) {
      fs.mkdirSync(tasksDir, { recursive: true });
    }
    const logPath = path.join(tasksDir, log.task_id + '.json');
    
    // Mask sensitive data before saving
    const maskedLog = maskSensitiveObject(log);
    
    fs.writeFileSync(logPath, JSON.stringify(maskedLog, null, 2), 'utf-8');
  }

  /**
   * Add event to task log (legacy)
   */
  async addEvent(
    taskId: string,
    eventType: LogEventType,
    content: LogEventContent,
    metadata?: Record<string, unknown>
  ): Promise<LogEvent> {
    const log = await this.getTaskLog(taskId);
    if (!log) {
      throw new Error('Task log not found: ' + taskId);
    }

    const eventId = 'evt-' + String(log.events.length + 1).padStart(3, '0');
    const event = createLogEvent(eventId, eventType, content, metadata);
    
    const updatedLog = addEventToTaskLog(log, event);
    await this.saveTaskLog(updatedLog);
    
    return event;
  }

  /**
   * Complete a task (legacy)
   */
  async completeTask(
    taskId: string,
    status: 'COMPLETE' | 'INCOMPLETE' | 'ERROR',
    filesModified: string[] = [],
    evidenceRef?: string,
    errorMessage?: string
  ): Promise<void> {
    const log = await this.getTaskLog(taskId);
    if (!log) {
      throw new Error('Task log not found: ' + taskId);
    }

    // Add completion event
    await this.addEvent(taskId, status === 'ERROR' ? 'TASK_ERROR' : 'TASK_COMPLETED', {
      status,
      files_modified: filesModified,
      evidence_ref: evidenceRef,
      error_message: errorMessage,
    });

    // Update index entry
    const index = await this.getOrCreateIndex(log.session_id);
    const entry = index.entries.find(e => e.task_id === taskId);
    if (entry) {
      entry.status = status;
      entry.completed_at = new Date().toISOString();
      entry.duration_ms = new Date(entry.completed_at).getTime() - new Date(entry.started_at).getTime();
      entry.files_modified_count = filesModified.length;
    }
    await this.saveIndex(index);
  }

  /**
   * Get task list for display (Layer 1) (legacy)
   * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 2.1
   */
  async getTaskList(sessionId: string): Promise<TaskLogEntry[]> {
    const index = await this.getOrCreateIndex(sessionId);
    return index.entries;
  }

  /**
   * Get task detail for display (Layer 2) (legacy)
   * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 2.2
   */
  async getTaskDetail(taskId: string, visibility: VisibilityLevel = 'summary'): Promise<{
    log: TaskLog | null;
    events: LogEvent[];
  }> {
    const log = await this.getTaskLog(taskId);
    if (!log) {
      return { log: null, events: [] };
    }

    const events = filterEventsByVisibility(log.events, visibility);
    
    // Mask any remaining sensitive data in display
    const maskedEvents = events.map(e => ({
      ...e,
      content: maskSensitiveObject(e.content),
    }));

    return { log, events: maskedEvents };
  }

  /**
   * Format task list for REPL display (legacy)
   * Per redesign: Shows task description for visibility
   */
  formatTaskList(entries: TaskLogEntry[], sessionId: string): string {
    if (entries.length === 0) {
      return 'No tasks logged for this session.';
    }

    let output = 'Task Logs (session: ' + sessionId + '):\n\n';

    entries.forEach((entry, index) => {
      const duration = entry.duration_ms > 0
        ? (entry.duration_ms / 1000).toFixed(1) + 's'
        : '-';

      // Status icon
      let statusIcon = '';
      if (entry.status === 'COMPLETE') {
        statusIcon = '[OK]';
      } else if (entry.status === 'ERROR') {
        statusIcon = '[ERR]';
      } else if (entry.status === 'INCOMPLETE') {
        statusIcon = '[INC]';
      } else {
        statusIcon = '[...]';
      }

      // Task line with description
      output += '  ' + (index + 1) + '. ' + entry.task_id + ' ' + statusIcon + '\n';

      // Description (truncated to 60 chars)
      if (entry.description) {
        const truncatedDesc = entry.description.length > 60
          ? entry.description.substring(0, 57) + '...'
          : entry.description;
        output += '     Prompt: ' + truncatedDesc + '\n';
      }

      // Stats line
      output += '     ' + duration + ' | Files: ' + entry.files_modified_count;
      if (entry.executor_mode) {
        output += ' | Mode: ' + entry.executor_mode;
      }
      if (entry.executor_blocked) {
        output += ' | BLOCKED: ' + (entry.blocked_reason || 'unknown');
      }
      output += '\n';

      // Files modified summary (if any)
      if (entry.files_modified && entry.files_modified.length > 0) {
        const filesDisplay = entry.files_modified.slice(0, 3).join(', ');
        const moreCount = entry.files_modified.length > 3 ? ' +' + (entry.files_modified.length - 3) + ' more' : '';
        output += '     Changed: ' + filesDisplay + moreCount + '\n';
      }

      output += '\n';
    });

    output += 'Use /logs <task-id> to view details.\n';
    output += 'Use /logs <task-id> --full for executor-level logs.';

    return output;
  }

  /**
   * Format task detail for REPL display (legacy)
   * Per redesign: Shows summary section with description, executor mode, files modified, and response
   */
  formatTaskDetail(taskId: string, log: TaskLog, events: LogEvent[], isFull: boolean, entry?: TaskLogEntry): string {
    let output = '--- Task Detail: ' + taskId + ' ---\n';
    if (isFull) {
      output += '(Full mode - showing all executor details)\n';
    }
    output += '\n';

    // Per redesign: Show summary section at top with visibility fields
    output += '=== Summary ===\n';
    output += 'Status: ' + (entry?.status || 'UNKNOWN') + '\n';
    if (entry?.duration_ms && entry.duration_ms > 0) {
      output += 'Duration: ' + (entry.duration_ms / 1000).toFixed(1) + 's\n';
    }
    if (entry?.executor_mode) {
      output += 'Executor: ' + entry.executor_mode + '\n';
    }
    output += '\n';

    // Prompt/Description
    if (entry?.description) {
      output += '=== Prompt ===\n';
      output += entry.description + '\n\n';
    }

    // Files Modified
    if (entry?.files_modified && entry.files_modified.length > 0) {
      output += '=== Files Modified (' + entry.files_modified.length + ') ===\n';
      for (const file of entry.files_modified) {
        output += '  - ' + file + '\n';
      }
      output += '\n';
    }

    // Response Summary
    if (entry?.response_summary) {
      output += '=== Response Summary ===\n';
      output += entry.response_summary + '\n\n';
    }

    // Executor Blocking Info
    if (entry?.executor_blocked) {
      output += '=== BLOCKED ===\n';
      output += 'Reason: ' + (entry.blocked_reason || 'unknown') + '\n\n';
    }

    // Event Log
    if (events.length > 0) {
      output += '=== Event Log ===\n';
      for (const event of events) {
        const time = new Date(event.timestamp).toLocaleTimeString();
        output += '[' + time + '] ' + event.event_type + '\n';

        // Format content based on event type
        if (event.content.text) {
          output += '  "' + maskSensitiveData(event.content.text) + '"\n';
        }
        if (event.content.question) {
          output += '  "' + maskSensitiveData(event.content.question) + '"\n';
        }
        if (event.content.action) {
          output += '  Action: ' + event.content.action + '\n';
        }
        if (event.content.target_file) {
          output += '  Target: ' + event.content.target_file + '\n';
        }
        if (event.content.status) {
          output += '  Status: ' + event.content.status + '\n';
        }
        if (event.content.files_modified && event.content.files_modified.length > 0) {
          output += '  Files modified: ' + event.content.files_modified.join(', ') + '\n';
        }
        if (event.content.evidence_ref) {
          output += '  Evidence: ' + event.content.evidence_ref + '\n';
        }
        if (event.content.error_message) {
          output += '  Error: ' + maskSensitiveData(event.content.error_message) + '\n';
        }

        // Full mode specific content
        if (isFull) {
          if (event.content.provider) {
            output += '  Provider: ' + event.content.provider + '\n';
          }
          if (event.content.model) {
            output += '  Model: ' + event.content.model + '\n';
          }
          if (event.content.tokens_input !== undefined) {
            output += '  Tokens: ' + event.content.tokens_input + ' input';
            if (event.content.tokens_output !== undefined) {
              output += ', ' + event.content.tokens_output + ' output';
            }
            output += '\n';
          }
          if (event.content.latency_ms !== undefined) {
            output += '  Latency: ' + event.content.latency_ms + 'ms\n';
          }
          if (event.content.exit_code !== undefined) {
            output += '  Exit code: ' + event.content.exit_code + '\n';
          }
          if (event.content.output_summary) {
            output += '  Output: ' + maskSensitiveData(event.content.output_summary) + '\n';
          }
        }

        output += '\n';
      }
    }

    if (!isFull) {
      output += 'Use --full to see executor details.';
    }

    return output;
  }
}

export { LOG_DIR, INDEX_FILE, TASKS_DIR, RAW_DIR, SESSIONS_DIR, SESSION_FILE };
