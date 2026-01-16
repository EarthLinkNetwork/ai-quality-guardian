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

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Session, SessionStatus } from '../models/session';
import { Phase, OverallStatus } from '../models/enums';
import { ErrorCode, getErrorMessage } from '../errors/error-codes';

/**
 * Runner version for session metadata
 */
const RUNNER_VERSION = '1.0.0';

/**
 * Session Manager Error
 */
export class SessionManagerError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>) {
    super(message || getErrorMessage(code));
    this.name = 'SessionManagerError';
    this.code = code;
    this.details = details;
  }
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
export class SessionManager {
  private readonly baseDir: string;

  /**
   * Create a new SessionManager
   * @param baseDir Base directory for session storage
   */
  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  /**
   * Generate a unique session ID
   * Format: session-{timestamp}-{uuid}
   */
  generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const uniqueId = uuidv4().split('-')[0];
    return `session-${timestamp}-${uniqueId}`;
  }

  /**
   * Initialize a new session with evidence structure
   * Creates session.json and executor_runs.jsonl
   */
  initializeSession(targetProject: string): Session {
    const sessionId = this.generateSessionId();
    const sessionDir = path.join(this.baseDir, sessionId);

    // Create session directory
    fs.mkdirSync(sessionDir, { recursive: true });

    // Create initial session object
    const session: Session = {
      session_id: sessionId,
      started_at: new Date().toISOString(),
      target_project: targetProject,
      runner_version: RUNNER_VERSION,
      configuration: {},
      current_phase: Phase.REQUIREMENT_ANALYSIS,
      status: OverallStatus.INCOMPLETE,
      continuation_approved: false,
      limit_violations: [],
      phases_completed: [],
    };

    // Write session.json
    const sessionJsonPath = path.join(sessionDir, 'session.json');
    fs.writeFileSync(sessionJsonPath, JSON.stringify(session, null, 2), 'utf-8');

    // Create empty executor_runs.jsonl
    const executorRunsPath = path.join(sessionDir, 'executor_runs.jsonl');
    fs.writeFileSync(executorRunsPath, '', 'utf-8');

    return session;
  }

  /**
   * Persist session state to disk
   * @throws SessionManagerError with E203 on write failure
   */
  persistSession(session: Session): void {
    const sessionDir = path.join(this.baseDir, session.session_id);
    const sessionJsonPath = path.join(sessionDir, 'session.json');

    try {
      fs.writeFileSync(sessionJsonPath, JSON.stringify(session, null, 2), 'utf-8');
    } catch (error) {
      throw new SessionManagerError(
        ErrorCode.E203_STATE_PERSISTENCE_FAILURE,
        `Failed to persist session state: ${(error as Error).message}`,
        { sessionId: session.session_id, error: (error as Error).message }
      );
    }
  }

  /**
   * Load session from disk
   * @throws SessionManagerError with E201 if session not found
   */
  loadSession(sessionId: string): Session {
    if (!sessionId || sessionId.length === 0) {
      throw new SessionManagerError(
        ErrorCode.E201_SESSION_ID_MISSING,
        'Session ID is required',
        { sessionId }
      );
    }

    const sessionDir = path.join(this.baseDir, sessionId);
    const sessionJsonPath = path.join(sessionDir, 'session.json');

    if (!fs.existsSync(sessionJsonPath)) {
      throw new SessionManagerError(
        ErrorCode.E201_SESSION_ID_MISSING,
        `Session not found: ${sessionId}`,
        { sessionId }
      );
    }

    const content = fs.readFileSync(sessionJsonPath, 'utf-8');
    return JSON.parse(content) as Session;
  }

  /**
   * Record an executor run to executor_runs.jsonl
   */
  recordExecutorRun(sessionId: string, executorRun: ExecutorRun | Record<string, unknown>): void {
    const sessionDir = path.join(this.baseDir, sessionId);
    const executorRunsPath = path.join(sessionDir, 'executor_runs.jsonl');

    const line = JSON.stringify(executorRun) + '\n';
    fs.appendFileSync(executorRunsPath, line, 'utf-8');
  }

  /**
   * List all sessions in the base directory
   */
  listSessions(): Session[] {
    const sessions: Session[] = [];

    if (!fs.existsSync(this.baseDir)) {
      return sessions;
    }

    const entries = fs.readdirSync(this.baseDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('session-')) {
        try {
          const session = this.loadSession(entry.name);
          sessions.push(session);
        } catch {
          // Skip invalid session directories
        }
      }
    }

    return sessions;
  }

  /**
   * Get session status by ID
   * @throws SessionManagerError with E201 if session not found
   */
  getSessionStatus(sessionId: string): { status: SessionStatus } {
    const session = this.loadSession(sessionId);
    return { status: session.status as SessionStatus };
  }

  /**
   * Complete a session with final status
   */
  completeSession(sessionId: string, status: SessionStatus): void {
    const session = this.loadSession(sessionId);
    session.status = status;
    session.completed_at = new Date().toISOString();
    this.persistSession(session);
  }

  /**
   * Resume a paused session
   * @throws SessionManagerError with E205 if session cannot be resumed
   */
  resumeSession(sessionId: string): Session {
    const session = this.loadSession(sessionId);

    // Check if session can be resumed
    if (session.status === SessionStatus.COMPLETED || session.status === SessionStatus.FAILED) {
      throw new SessionManagerError(
        ErrorCode.E205_SESSION_RESUME_FAILURE,
        `Cannot resume session with status: ${session.status}`,
        { sessionId, currentStatus: session.status }
      );
    }

    // Set status to RUNNING
    session.status = SessionStatus.RUNNING;
    this.persistSession(session);

    return session;
  }
}
