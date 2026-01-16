/**
 * Task Log Manager
 *
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md:
 * - Logs stored in .claude/logs/sessions/<session_id>/
 * - Two-layer viewing (list and detail)
 * - Visibility control (summary/full)
 * - Thread/Run/Task hierarchy support (v2.0)
 */
import { TaskLog, TaskLogIndex, TaskLogEntry, LogEvent, LogEventType, LogEventContent, VisibilityLevel, Thread, Run, RunTrigger, RunStatus, ThreadType, SessionMetadata } from '../models/repl/task-log';
import type { BlockedReason, TerminatedBy } from '../models/enums';
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
declare const LOG_DIR = "logs";
declare const SESSIONS_DIR = "sessions";
declare const TASKS_DIR = "tasks";
declare const RAW_DIR = "raw";
declare const INDEX_FILE = "index.json";
declare const SESSION_FILE = "session.json";
/**
 * Task Log Manager class
 * Supports Thread/Run/Task hierarchy (v2.0)
 */
export declare class TaskLogManager {
    private readonly projectPath;
    private readonly logsPath;
    private threadCounters;
    private runCounters;
    private taskCounters;
    constructor(projectPath: string);
    /**
     * Get session directory path
     */
    private getSessionPath;
    /**
     * Get session tasks directory path
     */
    private getSessionTasksPath;
    /**
     * Ensure log directories exist (legacy support)
     * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 1.3
     */
    ensureLogDirectories(): Promise<void>;
    /**
     * Ensure session-based directories exist
     * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 1.1
     */
    ensureSessionDirectories(sessionId: string): Promise<void>;
    /**
     * Initialize a new session
     * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 1.2
     */
    initializeSession(sessionId: string): Promise<SessionMetadata>;
    /**
     * Update global index with new session
     */
    private updateGlobalIndex;
    /**
     * Get session metadata
     */
    getSessionMetadata(sessionId: string): Promise<SessionMetadata>;
    /**
     * Save session metadata
     */
    private saveSessionMetadata;
    /**
     * Get session index
     */
    getSessionIndex(sessionId: string): Promise<TaskLogIndex>;
    /**
     * Save session index
     */
    private saveSessionIndex;
    /**
     * Generate next thread ID for session
     */
    private generateThreadId;
    /**
     * Generate next run ID for session
     */
    private generateRunId;
    /**
     * Generate next task ID for session
     */
    private generateTaskId;
    /**
     * Create a new thread
     * Per spec 05_DATA_MODELS.md Section "Thread"
     */
    createThread(sessionId: string, threadType: ThreadType, description?: string): Promise<Thread>;
    /**
     * Create a new run
     * Per spec 05_DATA_MODELS.md Section "Run"
     */
    createRun(sessionId: string, threadId: string, trigger: RunTrigger): Promise<Run>;
    /**
     * Get a run by ID
     */
    getRun(sessionId: string, runId: string): Promise<Run | null>;
    /**
     * Complete a run
     */
    completeRun(sessionId: string, runId: string, status: RunStatus): Promise<void>;
    /**
     * Complete a task with session context
     * Per spec 06_CORRECTNESS_PROPERTIES.md Property 26: Fail-Closed Logging
     * TaskLog MUST be saved for ALL terminal states (COMPLETE, INCOMPLETE, ERROR)
     * Per spec 10_REPL_UX.md Section 10: Records executor blocking info (Property 34-36)
     */
    completeTaskWithSession(taskId: string, sessionId: string, status: 'COMPLETE' | 'INCOMPLETE' | 'ERROR', filesModified?: string[], evidenceRef?: string, errorMessage?: string, options?: CompleteTaskOptions): Promise<void>;
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
    createTaskWithContext(sessionId: string, threadId: string, runId: string, parentTaskId?: string, externalTaskId?: string): Promise<TaskLog>;
    /**
     * Increment task count in global index
     */
    private incrementGlobalTaskCount;
    /**
     * Get task log with session context
     */
    getTaskLogWithSession(taskId: string, sessionId: string): Promise<TaskLog | null>;
    /**
     * Save task log with session context
     */
    private saveTaskLogWithSession;
    /**
     * Add event to task log with session context
     */
    addEventWithSession(taskId: string, sessionId: string, eventType: LogEventType, content: LogEventContent, metadata?: Record<string, unknown>): Promise<LogEvent>;
    /**
     * Get task detail with session context
     * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 2.2
     */
    getTaskDetailWithSession(taskId: string, sessionId: string, visibility?: VisibilityLevel): Promise<{
        log: TaskLog | null;
        events: LogEvent[];
    }>;
    /**
     * Format tree view of session hierarchy
     * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 2.5
     */
    formatTreeView(sessionId: string): Promise<string>;
    /**
     * Get or create log index (legacy)
     */
    getOrCreateIndex(sessionId: string): Promise<TaskLogIndex>;
    /**
     * Save log index (legacy)
     */
    saveIndex(index: TaskLogIndex): Promise<void>;
    /**
     * Create a new task log (legacy - without thread/run context)
     */
    createTask(taskId: string, sessionId: string): Promise<TaskLog>;
    /**
     * Get task log by ID (legacy)
     */
    getTaskLog(taskId: string): Promise<TaskLog | null>;
    /**
     * Save task log (legacy)
     */
    saveTaskLog(log: TaskLog): Promise<void>;
    /**
     * Add event to task log (legacy)
     */
    addEvent(taskId: string, eventType: LogEventType, content: LogEventContent, metadata?: Record<string, unknown>): Promise<LogEvent>;
    /**
     * Complete a task (legacy)
     */
    completeTask(taskId: string, status: 'COMPLETE' | 'INCOMPLETE' | 'ERROR', filesModified?: string[], evidenceRef?: string, errorMessage?: string): Promise<void>;
    /**
     * Get task list for display (Layer 1) (legacy)
     * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 2.1
     */
    getTaskList(sessionId: string): Promise<TaskLogEntry[]>;
    /**
     * Get task detail for display (Layer 2) (legacy)
     * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 2.2
     */
    getTaskDetail(taskId: string, visibility?: VisibilityLevel): Promise<{
        log: TaskLog | null;
        events: LogEvent[];
    }>;
    /**
     * Format task list for REPL display (legacy)
     * Per redesign: Shows task description for visibility
     */
    formatTaskList(entries: TaskLogEntry[], sessionId: string): string;
    /**
     * Format task detail for REPL display (legacy)
     * Per redesign: Shows summary section with description, executor mode, files modified, and response
     */
    formatTaskDetail(taskId: string, log: TaskLog, events: LogEvent[], isFull: boolean, entry?: TaskLogEntry): string;
}
export { LOG_DIR, INDEX_FILE, TASKS_DIR, RAW_DIR, SESSIONS_DIR, SESSION_FILE };
//# sourceMappingURL=task-log-manager.d.ts.map