"use strict";
/**
 * Session Model
 * Based on 05_DATA_MODELS.md L8-21
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionValidationError = exports.SessionStatus = void 0;
exports.createSession = createSession;
exports.validateSession = validateSession;
exports.updateSessionPhase = updateSessionPhase;
exports.updateSessionStatus = updateSessionStatus;
exports.completeSession = completeSession;
exports.failSession = failSession;
const uuid_1 = require("uuid");
const enums_1 = require("./enums");
/**
 * Session execution status (for session manager)
 */
var SessionStatus;
(function (SessionStatus) {
    SessionStatus["INITIALIZED"] = "INITIALIZED";
    SessionStatus["RUNNING"] = "RUNNING";
    SessionStatus["PAUSED"] = "PAUSED";
    SessionStatus["COMPLETED"] = "COMPLETED";
    SessionStatus["FAILED"] = "FAILED";
})(SessionStatus || (exports.SessionStatus = SessionStatus = {}));
/**
 * Session validation error
 */
class SessionValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SessionValidationError';
    }
}
exports.SessionValidationError = SessionValidationError;
/**
 * Create a new session
 */
function createSession(targetProject, runnerVersion, configuration) {
    return {
        session_id: `session-${(0, uuid_1.v4)()}`,
        started_at: new Date().toISOString(),
        target_project: targetProject,
        runner_version: runnerVersion,
        configuration,
        current_phase: enums_1.Phase.REQUIREMENT_ANALYSIS,
        status: enums_1.OverallStatus.INCOMPLETE,
        continuation_approved: false,
        limit_violations: [],
        phases_completed: [],
    };
}
/**
 * Validate a session object
 * @throws SessionValidationError if validation fails
 */
function validateSession(session) {
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
function updateSessionPhase(session, newPhase) {
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
function updateSessionStatus(session, newStatus) {
    return {
        ...session,
        status: newStatus,
        ended_at: newStatus !== enums_1.OverallStatus.INCOMPLETE ? new Date().toISOString() : session.ended_at,
    };
}
/**
 * Mark session as complete
 */
function completeSession(session) {
    return {
        ...session,
        status: enums_1.OverallStatus.COMPLETE,
        ended_at: new Date().toISOString(),
        phases_completed: session.phases_completed
            ? [...session.phases_completed, session.current_phase]
            : [session.current_phase],
    };
}
/**
 * Mark session with error
 */
function failSession(session, errorCode, errorMessage, details) {
    return {
        ...session,
        status: enums_1.OverallStatus.ERROR,
        ended_at: new Date().toISOString(),
        error: {
            code: errorCode,
            message: errorMessage,
            details,
        },
    };
}
//# sourceMappingURL=session.js.map