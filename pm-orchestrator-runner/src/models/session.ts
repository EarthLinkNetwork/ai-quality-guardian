/**
 * Session Model
 * Based on 05_DATA_MODELS.md L8-21
 */

import { v4 as uuidv4 } from 'uuid';
import { Phase, OverallStatus } from './enums';

/**
 * Session execution status (for session manager)
 */
export enum SessionStatus {
  INITIALIZED = 'INITIALIZED',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

/**
 * Session data structure
 * Note: status field can be either OverallStatus (for validation outcome)
 * or SessionStatus (for execution state in SessionManager)
 */
export interface Session {
  session_id: string;
  started_at: string;
  target_project: string;
  runner_version: string;
  configuration: Record<string, unknown>;
  current_phase: Phase;
  status: OverallStatus | SessionStatus;
  continuation_approved: boolean;
  limit_violations: string[];
  phases_completed?: Phase[];
  ended_at?: string;
  completed_at?: string;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Session validation error
 */
export class SessionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionValidationError';
  }
}

/**
 * Create a new session
 */
export function createSession(
  targetProject: string,
  runnerVersion: string,
  configuration: Record<string, unknown>
): Session {
  return {
    session_id: `session-${uuidv4()}`,
    started_at: new Date().toISOString(),
    target_project: targetProject,
    runner_version: runnerVersion,
    configuration,
    current_phase: Phase.REQUIREMENT_ANALYSIS,
    status: OverallStatus.INCOMPLETE,
    continuation_approved: false,
    limit_violations: [],
    phases_completed: [],
  };
}

/**
 * Validate a session object
 * @throws SessionValidationError if validation fails
 */
export function validateSession(session: Session): boolean {
  if (!session.session_id || session.session_id.length === 0) {
    throw new SessionValidationError('session_id is required');
  }

  if (!session.started_at || session.started_at.length === 0) {
    throw new SessionValidationError('started_at is required');
  }

  // Validate timestamp format
  const timestamp = new Date(session.started_at);
  if (isNaN(timestamp.getTime())) {
    throw new SessionValidationError('started_at must be a valid ISO 8601 timestamp');
  }

  if (!session.target_project || session.target_project.length === 0) {
    throw new SessionValidationError('target_project is required');
  }

  if (!session.runner_version || session.runner_version.length === 0) {
    throw new SessionValidationError('runner_version is required');
  }

  if (session.current_phase === undefined) {
    throw new SessionValidationError('current_phase is required');
  }

  if (session.status === undefined) {
    throw new SessionValidationError('status is required');
  }

  if (session.continuation_approved === undefined) {
    throw new SessionValidationError('continuation_approved is required');
  }

  if (!Array.isArray(session.limit_violations)) {
    throw new SessionValidationError('limit_violations must be an array');
  }

  return true;
}

/**
 * Update session phase
 */
export function updateSessionPhase(session: Session, newPhase: Phase): Session {
  return {
    ...session,
    current_phase: newPhase,
    phases_completed: session.phases_completed
      ? [...session.phases_completed, session.current_phase]
      : [session.current_phase],
  };
}

/**
 * Update session status
 */
export function updateSessionStatus(session: Session, newStatus: OverallStatus): Session {
  return {
    ...session,
    status: newStatus,
    ended_at: newStatus !== OverallStatus.INCOMPLETE ? new Date().toISOString() : session.ended_at,
  };
}

/**
 * Mark session as complete
 */
export function completeSession(session: Session): Session {
  return {
    ...session,
    status: OverallStatus.COMPLETE,
    ended_at: new Date().toISOString(),
    phases_completed: session.phases_completed
      ? [...session.phases_completed, session.current_phase]
      : [session.current_phase],
  };
}

/**
 * Mark session with error
 */
export function failSession(
  session: Session,
  errorCode: string,
  errorMessage: string,
  details?: Record<string, unknown>
): Session {
  return {
    ...session,
    status: OverallStatus.ERROR,
    ended_at: new Date().toISOString(),
    error: {
      code: errorCode,
      message: errorMessage,
      details,
    },
  };
}
