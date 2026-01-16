/**
 * Session Manager
 * Based on 04_COMPONENTS.md L83-97
 *
 * Responsible for:
 * - Session ID generation
 * - Session evidence initialization
 * - Session state persistence
 * - Session lifecycle management
 */
import { Session, SessionStatus } from '../models/session';
import { ErrorCode } from '../errors/error-codes';
/**
 * Session Manager Error
 */
export declare class SessionManagerError extends Error {
    readonly code: ErrorCode;
    readonly details?: Record<string, unknown>;
    constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>);
}
/**
 * Executor Run record structure
 */
export interface ExecutorRun {
    executor_id: string;
    started_at: string;
    task_id: string;
    [key: string]: unknown;
}
/**
 * Session Manager class
 */
export declare class SessionManager {
    private readonly baseDir;
    /**
     * Create a new SessionManager
     * @param baseDir Base directory for session storage
     */
    constructor(baseDir: string);
    /**
     * Generate a unique session ID
     * Format: session-{timestamp}-{uuid}
     */
    generateSessionId(): string;
    /**
     * Initialize a new session with evidence structure
     * Creates session.json and executor_runs.jsonl
     */
    initializeSession(targetProject: string): Session;
    /**
     * Persist session state to disk
     * @throws SessionManagerError with E203 on write failure
     */
    persistSession(session: Session): void;
    /**
     * Load session from disk
     * @throws SessionManagerError with E201 if session not found
     */
    loadSession(sessionId: string): Session;
    /**
     * Record an executor run to executor_runs.jsonl
     */
    recordExecutorRun(sessionId: string, executorRun: ExecutorRun | Record<string, unknown>): void;
    /**
     * List all sessions in the base directory
     */
    listSessions(): Session[];
    /**
     * Get session status by ID
     * @throws SessionManagerError with E201 if session not found
     */
    getSessionStatus(sessionId: string): {
        status: SessionStatus;
    };
    /**
     * Complete a session with final status
     */
    completeSession(sessionId: string, status: SessionStatus): void;
    /**
     * Resume a paused session
     * @throws SessionManagerError with E205 if session cannot be resumed
     */
    resumeSession(sessionId: string): Session;
}
//# sourceMappingURL=session-manager.d.ts.map