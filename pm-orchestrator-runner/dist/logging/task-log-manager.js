"use strict";
/**
 * Task Log Manager
 *
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md:
 * - Logs stored in .claude/logs/sessions/<session_id>/
 * - Two-layer viewing (list and detail)
 * - Visibility control (summary/full)
 * - Thread/Run/Task hierarchy support (v2.0)
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSION_FILE = exports.SESSIONS_DIR = exports.RAW_DIR = exports.TASKS_DIR = exports.INDEX_FILE = exports.LOG_DIR = exports.TaskLogManager = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const task_log_1 = require("../models/repl/task-log");
const sensitive_data_masker_1 = require("./sensitive-data-masker");
/**
 * Log directory structure
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 1.1
 */
const LOG_DIR = 'logs';
exports.LOG_DIR = LOG_DIR;
const SESSIONS_DIR = 'sessions';
exports.SESSIONS_DIR = SESSIONS_DIR;
const TASKS_DIR = 'tasks';
exports.TASKS_DIR = TASKS_DIR;
const RAW_DIR = 'raw';
exports.RAW_DIR = RAW_DIR;
const INDEX_FILE = 'index.json';
exports.INDEX_FILE = INDEX_FILE;
const SESSION_FILE = 'session.json';
exports.SESSION_FILE = SESSION_FILE;
/**
 * Task Log Manager class
 * Supports Thread/Run/Task hierarchy (v2.0)
 */
class TaskLogManager {
    projectPath;
    logsPath;
    // Session-scoped counters for sequential IDs
    threadCounters = new Map();
    runCounters = new Map();
    taskCounters = new Map();
    constructor(projectPath) {
        this.projectPath = projectPath;
        this.logsPath = path.join(projectPath, '.claude', LOG_DIR);
    }
    /**
     * Get session directory path
     */
    getSessionPath(sessionId) {
        return path.join(this.logsPath, SESSIONS_DIR, sessionId);
    }
    /**
     * Get session tasks directory path
     */
    getSessionTasksPath(sessionId) {
        return path.join(this.getSessionPath(sessionId), TASKS_DIR);
    }
    /**
     * Ensure log directories exist (legacy support)
     * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 1.3
     */
    async ensureLogDirectories() {
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
    async ensureSessionDirectories(sessionId) {
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
    async initializeSession(sessionId) {
        await this.ensureSessionDirectories(sessionId);
        // Initialize counters for this session
        this.threadCounters.set(sessionId, 0);
        this.runCounters.set(sessionId, 0);
        this.taskCounters.set(sessionId, 0);
        // Create session metadata
        const sessionMeta = (0, task_log_1.createSessionMetadata)(sessionId);
        const sessionMetaPath = path.join(this.getSessionPath(sessionId), SESSION_FILE);
        fs.writeFileSync(sessionMetaPath, JSON.stringify(sessionMeta, null, 2), 'utf-8');
        // Create session index
        const sessionIndex = (0, task_log_1.createTaskLogIndex)(sessionId);
        const sessionIndexPath = path.join(this.getSessionPath(sessionId), INDEX_FILE);
        fs.writeFileSync(sessionIndexPath, JSON.stringify(sessionIndex, null, 2), 'utf-8');
        // Update global index
        await this.updateGlobalIndex(sessionId);
        return sessionMeta;
    }
    /**
     * Update global index with new session
     */
    async updateGlobalIndex(sessionId) {
        const globalIndexPath = path.join(this.logsPath, INDEX_FILE);
        let globalIndex;
        if (fs.existsSync(globalIndexPath)) {
            try {
                const content = fs.readFileSync(globalIndexPath, 'utf-8');
                globalIndex = JSON.parse(content);
            }
            catch {
                globalIndex = (0, task_log_1.createGlobalLogIndex)();
            }
        }
        else {
            globalIndex = (0, task_log_1.createGlobalLogIndex)();
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
    async getSessionMetadata(sessionId) {
        const sessionMetaPath = path.join(this.getSessionPath(sessionId), SESSION_FILE);
        if (!fs.existsSync(sessionMetaPath)) {
            return (0, task_log_1.createSessionMetadata)(sessionId);
        }
        try {
            const content = fs.readFileSync(sessionMetaPath, 'utf-8');
            return JSON.parse(content);
        }
        catch {
            return (0, task_log_1.createSessionMetadata)(sessionId);
        }
    }
    /**
     * Save session metadata
     */
    async saveSessionMetadata(sessionId, metadata) {
        const sessionMetaPath = path.join(this.getSessionPath(sessionId), SESSION_FILE);
        fs.writeFileSync(sessionMetaPath, JSON.stringify(metadata, null, 2), 'utf-8');
    }
    /**
     * Get session index
     */
    async getSessionIndex(sessionId) {
        const sessionIndexPath = path.join(this.getSessionPath(sessionId), INDEX_FILE);
        if (!fs.existsSync(sessionIndexPath)) {
            return (0, task_log_1.createTaskLogIndex)(sessionId);
        }
        try {
            const content = fs.readFileSync(sessionIndexPath, 'utf-8');
            return JSON.parse(content);
        }
        catch {
            // Per spec: On corruption, return empty entries
            return (0, task_log_1.createTaskLogIndex)(sessionId);
        }
    }
    /**
     * Save session index
     */
    async saveSessionIndex(sessionId, index) {
        const sessionIndexPath = path.join(this.getSessionPath(sessionId), INDEX_FILE);
        index.updated_at = new Date().toISOString();
        fs.writeFileSync(sessionIndexPath, JSON.stringify((0, sensitive_data_masker_1.maskSensitiveObject)(index), null, 2), 'utf-8');
    }
    /**
     * Generate next thread ID for session
     */
    generateThreadId(sessionId) {
        const current = this.threadCounters.get(sessionId) ?? 0;
        const next = current + 1;
        this.threadCounters.set(sessionId, next);
        return 'thr-' + String(next).padStart(3, '0');
    }
    /**
     * Generate next run ID for session
     */
    generateRunId(sessionId) {
        const current = this.runCounters.get(sessionId) ?? 0;
        const next = current + 1;
        this.runCounters.set(sessionId, next);
        return 'run-' + String(next).padStart(3, '0');
    }
    /**
     * Generate next task ID for session
     */
    generateTaskId(sessionId) {
        const current = this.taskCounters.get(sessionId) ?? 0;
        const next = current + 1;
        this.taskCounters.set(sessionId, next);
        return 'task-' + String(next).padStart(3, '0');
    }
    /**
     * Create a new thread
     * Per spec 05_DATA_MODELS.md Section "Thread"
     */
    async createThread(sessionId, threadType, description) {
        const threadId = this.generateThreadId(sessionId);
        const thread = (0, task_log_1.createThread)(threadId, sessionId, threadType, description);
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
    async createRun(sessionId, threadId, trigger) {
        const runId = this.generateRunId(sessionId);
        const run = (0, task_log_1.createRun)(runId, threadId, sessionId, trigger);
        // Add to session metadata
        const metadata = await this.getSessionMetadata(sessionId);
        metadata.runs.push({ run_id: runId, thread_id: threadId, status: 'RUNNING' });
        await this.saveSessionMetadata(sessionId, metadata);
        return run;
    }
    /**
     * Get a run by ID
     */
    async getRun(sessionId, runId) {
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
    async completeRun(sessionId, runId, status) {
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
    async completeTaskWithSession(taskId, sessionId, status, filesModified = [], evidenceRef, errorMessage, options) {
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
        const eventType = status === 'ERROR' ? 'TASK_ERROR' : 'TASK_COMPLETED';
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
    async createTaskWithContext(sessionId, threadId, runId, parentTaskId, externalTaskId) {
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
        const log = (0, task_log_1.createTaskLog)(taskId, sessionId, threadId, runId, parentTaskId ?? null);
        await this.saveTaskLogWithSession(log, sessionId);
        // Update session index
        const index = await this.getSessionIndex(sessionId);
        const entry = {
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
    async incrementGlobalTaskCount(sessionId) {
        const globalIndexPath = path.join(this.logsPath, INDEX_FILE);
        if (fs.existsSync(globalIndexPath)) {
            try {
                const content = fs.readFileSync(globalIndexPath, 'utf-8');
                const globalIndex = JSON.parse(content);
                const session = globalIndex.sessions.find(s => s.session_id === sessionId);
                if (session) {
                    session.task_count++;
                    globalIndex.updated_at = new Date().toISOString();
                    fs.writeFileSync(globalIndexPath, JSON.stringify(globalIndex, null, 2), 'utf-8');
                }
            }
            catch {
                // Ignore errors in global index update
            }
        }
    }
    /**
     * Get task log with session context
     */
    async getTaskLogWithSession(taskId, sessionId) {
        const logPath = path.join(this.getSessionTasksPath(sessionId), taskId + '.json');
        if (!fs.existsSync(logPath)) {
            return null;
        }
        try {
            const content = fs.readFileSync(logPath, 'utf-8');
            return JSON.parse(content);
        }
        catch {
            return null;
        }
    }
    /**
     * Save task log with session context
     */
    async saveTaskLogWithSession(log, sessionId) {
        await this.ensureSessionDirectories(sessionId);
        const logPath = path.join(this.getSessionTasksPath(sessionId), log.task_id + '.json');
        // Mask sensitive data before saving
        const maskedLog = (0, sensitive_data_masker_1.maskSensitiveObject)(log);
        fs.writeFileSync(logPath, JSON.stringify(maskedLog, null, 2), 'utf-8');
    }
    /**
     * Add event to task log with session context
     */
    async addEventWithSession(taskId, sessionId, eventType, content, metadata) {
        const log = await this.getTaskLogWithSession(taskId, sessionId);
        if (!log) {
            throw new Error('Task log not found: ' + taskId);
        }
        const eventId = 'evt-' + String(log.events.length + 1).padStart(3, '0');
        const event = (0, task_log_1.createLogEvent)(eventId, eventType, content, metadata);
        const updatedLog = (0, task_log_1.addEventToTaskLog)(log, event);
        await this.saveTaskLogWithSession(updatedLog, sessionId);
        return event;
    }
    /**
     * Get task detail with session context
     * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 2.2
     */
    async getTaskDetailWithSession(taskId, sessionId, visibility = 'summary') {
        const log = await this.getTaskLogWithSession(taskId, sessionId);
        if (!log) {
            return { log: null, events: [] };
        }
        const events = (0, task_log_1.filterEventsByVisibility)(log.events, visibility);
        // Mask any remaining sensitive data in display
        const maskedEvents = events.map(e => ({
            ...e,
            content: (0, sensitive_data_masker_1.maskSensitiveObject)(e.content),
        }));
        return { log, events: maskedEvents };
    }
    /**
     * Format tree view of session hierarchy
     * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 2.5
     */
    async formatTreeView(sessionId) {
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
    async getOrCreateIndex(sessionId) {
        await this.ensureLogDirectories();
        // Fixed: Read session-specific index, not global index
        const indexPath = path.join(this.getSessionPath(sessionId), INDEX_FILE);
        if (fs.existsSync(indexPath)) {
            try {
                const content = fs.readFileSync(indexPath, 'utf-8');
                return JSON.parse(content);
            }
            catch {
                // Per spec: On corruption, return empty list
                return (0, task_log_1.createTaskLogIndex)(sessionId);
            }
        }
        return (0, task_log_1.createTaskLogIndex)(sessionId);
    }
    /**
     * Save log index (legacy)
     */
    async saveIndex(index) {
        await this.ensureLogDirectories();
        // Fixed: Save to session-specific index, not global index
        const indexPath = path.join(this.getSessionPath(index.session_id), INDEX_FILE);
        // Mask any sensitive data before saving
        const maskedIndex = (0, sensitive_data_masker_1.maskSensitiveObject)(index);
        maskedIndex.updated_at = new Date().toISOString();
        fs.writeFileSync(indexPath, JSON.stringify(maskedIndex, null, 2), 'utf-8');
    }
    /**
     * Create a new task log (legacy - without thread/run context)
     */
    async createTask(taskId, sessionId) {
        await this.ensureLogDirectories();
        const log = (0, task_log_1.createTaskLog)(taskId, sessionId);
        await this.saveTaskLog(log);
        // Update index
        const index = await this.getOrCreateIndex(sessionId);
        const entry = {
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
    async getTaskLog(taskId) {
        const logPath = path.join(this.logsPath, TASKS_DIR, taskId + '.json');
        if (!fs.existsSync(logPath)) {
            return null;
        }
        try {
            const content = fs.readFileSync(logPath, 'utf-8');
            return JSON.parse(content);
        }
        catch {
            return null;
        }
    }
    /**
     * Save task log (legacy)
     */
    async saveTaskLog(log) {
        await this.ensureLogDirectories();
        const tasksDir = path.join(this.logsPath, TASKS_DIR);
        if (!fs.existsSync(tasksDir)) {
            fs.mkdirSync(tasksDir, { recursive: true });
        }
        const logPath = path.join(tasksDir, log.task_id + '.json');
        // Mask sensitive data before saving
        const maskedLog = (0, sensitive_data_masker_1.maskSensitiveObject)(log);
        fs.writeFileSync(logPath, JSON.stringify(maskedLog, null, 2), 'utf-8');
    }
    /**
     * Add event to task log (legacy)
     */
    async addEvent(taskId, eventType, content, metadata) {
        const log = await this.getTaskLog(taskId);
        if (!log) {
            throw new Error('Task log not found: ' + taskId);
        }
        const eventId = 'evt-' + String(log.events.length + 1).padStart(3, '0');
        const event = (0, task_log_1.createLogEvent)(eventId, eventType, content, metadata);
        const updatedLog = (0, task_log_1.addEventToTaskLog)(log, event);
        await this.saveTaskLog(updatedLog);
        return event;
    }
    /**
     * Complete a task (legacy)
     */
    async completeTask(taskId, status, filesModified = [], evidenceRef, errorMessage) {
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
    async getTaskList(sessionId) {
        const index = await this.getOrCreateIndex(sessionId);
        return index.entries;
    }
    /**
     * Get task detail for display (Layer 2) (legacy)
     * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 2.2
     */
    async getTaskDetail(taskId, visibility = 'summary') {
        const log = await this.getTaskLog(taskId);
        if (!log) {
            return { log: null, events: [] };
        }
        const events = (0, task_log_1.filterEventsByVisibility)(log.events, visibility);
        // Mask any remaining sensitive data in display
        const maskedEvents = events.map(e => ({
            ...e,
            content: (0, sensitive_data_masker_1.maskSensitiveObject)(e.content),
        }));
        return { log, events: maskedEvents };
    }
    /**
     * Format task list for REPL display (legacy)
     * Per redesign: Shows task description for visibility
     */
    formatTaskList(entries, sessionId) {
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
            }
            else if (entry.status === 'ERROR') {
                statusIcon = '[ERR]';
            }
            else if (entry.status === 'INCOMPLETE') {
                statusIcon = '[INC]';
            }
            else {
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
    formatTaskDetail(taskId, log, events, isFull, entry) {
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
                    output += '  "' + (0, sensitive_data_masker_1.maskSensitiveData)(event.content.text) + '"\n';
                }
                if (event.content.question) {
                    output += '  "' + (0, sensitive_data_masker_1.maskSensitiveData)(event.content.question) + '"\n';
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
                    output += '  Error: ' + (0, sensitive_data_masker_1.maskSensitiveData)(event.content.error_message) + '\n';
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
                        output += '  Output: ' + (0, sensitive_data_masker_1.maskSensitiveData)(event.content.output_summary) + '\n';
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
exports.TaskLogManager = TaskLogManager;
//# sourceMappingURL=task-log-manager.js.map