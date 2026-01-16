/**
 * Session Model
 * Based on 05_DATA_MODELS.md L8-21
 */
import { Phase, OverallStatus } from './enums';
/**
 * Session execution status (for session manager)
 */
export declare enum SessionStatus {
    INITIALIZED = "INITIALIZED",
    RUNNING = "RUNNING",
    PAUSED = "PAUSED",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED"
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
export declare class SessionValidationError extends Error {
    constructor(message: string);
}
/**
 * Create a new session
 */
export declare function createSession(targetProject: string, runnerVersion: string, configuration: Record<string, unknown>): Session;
/**
 * Validate a session object
 * @throws SessionValidationError if validation fails
 */
export declare function validateSession(session: Session): boolean;
/**
 * Update session phase
 */
export declare function updateSessionPhase(session: Session, newPhase: Phase): Session;
/**
 * Update session status
 */
export declare function updateSessionStatus(session: Session, newStatus: OverallStatus): Session;
/**
 * Mark session as complete
 */
export declare function completeSession(session: Session): Session;
/**
 * Mark session with error
 */
export declare function failSession(session: Session, errorCode: string, errorMessage: string, details?: Record<string, unknown>): Session;
//# sourceMappingURL=session.d.ts.map