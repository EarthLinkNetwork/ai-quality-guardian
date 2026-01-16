"use strict";
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
exports.SessionManager = exports.SessionManagerError = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const uuid_1 = require("uuid");
const session_1 = require("../models/session");
const enums_1 = require("../models/enums");
const error_codes_1 = require("../errors/error-codes");
/**
 * Runner version for session metadata
 */
const RUNNER_VERSION = '1.0.0';
/**
 * Session Manager Error
 */
class SessionManagerError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message || (0, error_codes_1.getErrorMessage)(code));
        this.name = 'SessionManagerError';
        this.code = code;
        this.details = details;
    }
}
exports.SessionManagerError = SessionManagerError;
/**
 * Session Manager class
 */
class SessionManager {
    baseDir;
    /**
     * Create a new SessionManager
     * @param baseDir Base directory for session storage
     */
    constructor(baseDir) {
        this.baseDir = baseDir;
    }
    /**
     * Generate a unique session ID
     * Format: session-{timestamp}-{uuid}
     */
    generateSessionId() {
        const timestamp = Date.now().toString(36);
        const uniqueId = (0, uuid_1.v4)().split('-')[0];
        return `session-${timestamp}-${uniqueId}`;
    }
    /**
     * Initialize a new session with evidence structure
     * Creates session.json and executor_runs.jsonl
     */
    initializeSession(targetProject) {
        const sessionId = this.generateSessionId();
        const sessionDir = path.join(this.baseDir, sessionId);
        // Create session directory
        fs.mkdirSync(sessionDir, { recursive: true });
        // Create initial session object
        const session = {
            session_id: sessionId,
            started_at: new Date().toISOString(),
            target_project: targetProject,
            runner_version: RUNNER_VERSION,
            configuration: {},
            current_phase: enums_1.Phase.REQUIREMENT_ANALYSIS,
            status: enums_1.OverallStatus.INCOMPLETE,
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
    persistSession(session) {
        const sessionDir = path.join(this.baseDir, session.session_id);
        const sessionJsonPath = path.join(sessionDir, 'session.json');
        try {
            fs.writeFileSync(sessionJsonPath, JSON.stringify(session, null, 2), 'utf-8');
        }
        catch (error) {
            throw new SessionManagerError(error_codes_1.ErrorCode.E203_STATE_PERSISTENCE_FAILURE, `Failed to persist session state: ${error.message}`, { sessionId: session.session_id, error: error.message });
        }
    }
    /**
     * Load session from disk
     * @throws SessionManagerError with E201 if session not found
     */
    loadSession(sessionId) {
        if (!sessionId || sessionId.length === 0) {
            throw new SessionManagerError(error_codes_1.ErrorCode.E201_SESSION_ID_MISSING, 'Session ID is required', { sessionId });
        }
        const sessionDir = path.join(this.baseDir, sessionId);
        const sessionJsonPath = path.join(sessionDir, 'session.json');
        if (!fs.existsSync(sessionJsonPath)) {
            throw new SessionManagerError(error_codes_1.ErrorCode.E201_SESSION_ID_MISSING, `Session not found: ${sessionId}`, { sessionId });
        }
        const content = fs.readFileSync(sessionJsonPath, 'utf-8');
        return JSON.parse(content);
    }
    /**
     * Record an executor run to executor_runs.jsonl
     */
    recordExecutorRun(sessionId, executorRun) {
        const sessionDir = path.join(this.baseDir, sessionId);
        const executorRunsPath = path.join(sessionDir, 'executor_runs.jsonl');
        const line = JSON.stringify(executorRun) + '\n';
        fs.appendFileSync(executorRunsPath, line, 'utf-8');
    }
    /**
     * List all sessions in the base directory
     */
    listSessions() {
        const sessions = [];
        if (!fs.existsSync(this.baseDir)) {
            return sessions;
        }
        const entries = fs.readdirSync(this.baseDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory() && entry.name.startsWith('session-')) {
                try {
                    const session = this.loadSession(entry.name);
                    sessions.push(session);
                }
                catch {
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
    getSessionStatus(sessionId) {
        const session = this.loadSession(sessionId);
        return { status: session.status };
    }
    /**
     * Complete a session with final status
     */
    completeSession(sessionId, status) {
        const session = this.loadSession(sessionId);
        session.status = status;
        session.completed_at = new Date().toISOString();
        this.persistSession(session);
    }
    /**
     * Resume a paused session
     * @throws SessionManagerError with E205 if session cannot be resumed
     */
    resumeSession(sessionId) {
        const session = this.loadSession(sessionId);
        // Check if session can be resumed
        if (session.status === session_1.SessionStatus.COMPLETED || session.status === session_1.SessionStatus.FAILED) {
            throw new SessionManagerError(error_codes_1.ErrorCode.E205_SESSION_RESUME_FAILURE, `Cannot resume session with status: ${session.status}`, { sessionId, currentStatus: session.status });
        }
        // Set status to RUNNING
        session.status = session_1.SessionStatus.RUNNING;
        this.persistSession(session);
        return session;
    }
}
exports.SessionManager = SessionManager;
//# sourceMappingURL=session-manager.js.map