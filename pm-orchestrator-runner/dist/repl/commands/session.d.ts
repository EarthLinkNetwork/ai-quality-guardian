/**
 * Session Commands Handler
 * Manages /start, /continue, /approve commands
 */
import { RunnerCore } from '../../core/runner-core';
import { REPLConfig } from '../repl-interface';
import { UserResponseHandler } from '../../executor/auto-resolve-executor';
/**
 * Session command result
 */
export interface SessionResult {
    success: boolean;
    message?: string;
    sessionId?: string;
    runner?: RunnerCore;
}
/**
 * REPL session state (shared with repl-interface)
 */
export interface REPLSession {
    sessionId: string | null;
    projectPath: string;
    runner: RunnerCore | null;
    supervisor: any;
    status: 'idle' | 'running' | 'paused';
}
/**
 * Options for starting a session with auto-resolve
 */
export interface StartSessionOptions {
    /** Handler for case-by-case questions that need user input */
    userResponseHandler?: UserResponseHandler;
}
/**
 * Session commands handler
 */
export declare class SessionCommands {
    private session;
    private config;
    constructor(session: REPLSession, config: REPLConfig);
    /**
     * Start a new session
     * @param projectPath - Path to project directory
     * @param options - Optional session options including userResponseHandler
     */
    start(projectPath: string, options?: StartSessionOptions): Promise<SessionResult>;
    /**
     * Continue an existing session
     * @param sessionId - Session ID to resume
     * @param options - Optional session options including userResponseHandler
     */
    continueSession(sessionId: string, options?: StartSessionOptions): Promise<SessionResult>;
    /**
     * Approve continuation for INCOMPLETE session
     */
    approve(sessionId: string): Promise<SessionResult>;
    /**
     * List available sessions
     */
    listSessions(): Promise<string[]>;
}
//# sourceMappingURL=session.d.ts.map