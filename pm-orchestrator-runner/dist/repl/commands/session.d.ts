/**
 * Session Commands Handler
 * Manages /start, /continue, /approve commands
 */
import { RunnerCore } from '../../core/runner-core';
import { REPLConfig } from '../repl-interface';
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
 * Session commands handler
 */
export declare class SessionCommands {
    private session;
    private config;
    constructor(session: REPLSession, config: REPLConfig);
    /**
     * Start a new session
     */
    start(projectPath: string): Promise<SessionResult>;
    /**
     * Continue an existing session
     */
    continueSession(sessionId: string): Promise<SessionResult>;
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