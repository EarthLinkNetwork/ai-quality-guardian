/**
 * Session Commands Handler
 * Manages /start, /continue, /approve commands
 */

import * as path from 'path';
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
export class SessionCommands {
  private session: REPLSession;
  private config: REPLConfig;

  constructor(session: REPLSession, config: REPLConfig) {
    this.session = session;
    this.config = config;
  }

  /**
   * Start a new session
   */
  async start(projectPath: string): Promise<SessionResult> {
    const absolutePath = path.resolve(projectPath);

    try {
      // Create new runner with Claude Code enabled for natural language task execution
      // This ensures that when REPL executes natural language tasks (e.g., "Create README.md"),
      // the actual Claude CLI is spawned to perform file operations.
      const runner = new RunnerCore({
        evidenceDir: this.config.evidenceDir || '',
        useClaudeCode: true,
        claudeCodeTimeout: this.config.timeout || 120000,
      });

      // Initialize runner with project path
      const result = await runner.initialize(absolutePath);

      return {
        success: true,
        sessionId: result.session_id || '',
        runner,
      };
    } catch (err) {
      return {
        success: false,
        message: `Failed to start session: ${(err as Error).message}`,
      };
    }
  }

  /**
   * Continue an existing session
   */
  async continueSession(sessionId: string): Promise<SessionResult> {
    try {
      // Create new runner with Claude Code enabled and resume session
      const runner = new RunnerCore({
        evidenceDir: this.config.evidenceDir || '',
        useClaudeCode: true,
        claudeCodeTimeout: this.config.timeout || 120000,
      });

      await runner.resume(sessionId);

      return {
        success: true,
        sessionId: sessionId,
        runner,
      };
    } catch (err) {
      return {
        success: false,
        message: `Failed to continue session: ${(err as Error).message}`,
      };
    }
  }

  /**
   * Approve continuation for INCOMPLETE session
   */
  async approve(sessionId: string): Promise<SessionResult> {
    if (!this.session.runner) {
      return {
        success: false,
        message: 'No active runner to approve',
      };
    }

    try {
      // Mark session as approved for continuation
      // This would integrate with the runner's state management
      const state = this.session.runner.getSessionState();

      if (!state || !state.session_id) {
        return {
          success: false,
          message: 'Session state not found',
        };
      }

      // Update approval status (this would be persisted)
      // For now, we just return success
      return {
        success: true,
        sessionId: sessionId,
        message: 'Session approved for continuation',
      };
    } catch (err) {
      return {
        success: false,
        message: `Failed to approve session: ${(err as Error).message}`,
      };
    }
  }

  /**
   * List available sessions
   */
  async listSessions(): Promise<string[]> {
    // This would scan the evidence directory for session folders
    // For now, return empty array
    return [];
  }
}
