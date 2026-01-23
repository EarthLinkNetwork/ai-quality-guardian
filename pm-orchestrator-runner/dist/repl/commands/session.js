"use strict";
/**
 * Session Commands Handler
 * Manages /start, /continue, /approve commands
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
exports.SessionCommands = void 0;
const path = __importStar(require("path"));
const runner_core_1 = require("../../core/runner-core");
/**
 * Session commands handler
 */
class SessionCommands {
    session;
    config;
    constructor(session, config) {
        this.session = session;
        this.config = config;
    }
    /**
     * Start a new session
     * @param projectPath - Path to project directory
     * @param options - Optional session options including userResponseHandler
     */
    async start(projectPath, options) {
        const absolutePath = path.resolve(projectPath);
        try {
            // Create new runner with Claude Code enabled for natural language task execution
            // This ensures that when REPL executes natural language tasks (e.g., "Create README.md"),
            // the actual Claude CLI is spawned to perform file operations.
            //
            // If enableAutoResolve is set in config, use AutoResolvingExecutor with LLM
            // to auto-answer best-practice questions and route case-by-case to user
            const runner = new runner_core_1.RunnerCore({
                evidenceDir: this.config.evidenceDir || '',
                useClaudeCode: true,
                claudeCodeTimeout: this.config.timeout || 120000,
                // Enable LLM auto-resolution if configured
                enableAutoResolve: this.config.enableAutoResolve,
                autoResolveLLMProvider: this.config.autoResolveLLMProvider,
                userResponseHandler: options?.userResponseHandler,
            });
            // Initialize runner with project path
            const result = await runner.initialize(absolutePath);
            return {
                success: true,
                sessionId: result.session_id || '',
                runner,
            };
        }
        catch (err) {
            return {
                success: false,
                message: `Failed to start session: ${err.message}`,
            };
        }
    }
    /**
     * Continue an existing session
     * @param sessionId - Session ID to resume
     * @param options - Optional session options including userResponseHandler
     */
    async continueSession(sessionId, options) {
        try {
            // Create new runner with Claude Code enabled and resume session
            // Also enable auto-resolve if configured
            const runner = new runner_core_1.RunnerCore({
                evidenceDir: this.config.evidenceDir || '',
                useClaudeCode: true,
                claudeCodeTimeout: this.config.timeout || 120000,
                // Enable LLM auto-resolution if configured
                enableAutoResolve: this.config.enableAutoResolve,
                autoResolveLLMProvider: this.config.autoResolveLLMProvider,
                userResponseHandler: options?.userResponseHandler,
            });
            await runner.resume(sessionId);
            return {
                success: true,
                sessionId: sessionId,
                runner,
            };
        }
        catch (err) {
            return {
                success: false,
                message: `Failed to continue session: ${err.message}`,
            };
        }
    }
    /**
     * Approve continuation for INCOMPLETE session
     */
    async approve(sessionId) {
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
        }
        catch (err) {
            return {
                success: false,
                message: `Failed to approve session: ${err.message}`,
            };
        }
    }
    /**
     * List available sessions
     */
    async listSessions() {
        // This would scan the evidence directory for session folders
        // For now, return empty array
        return [];
    }
}
exports.SessionCommands = SessionCommands;
//# sourceMappingURL=session.js.map