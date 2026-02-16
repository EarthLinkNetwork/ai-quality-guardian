/**
 * Claude Code Executor
 *
 * Executes tasks via Claude Code CLI subprocess.
 * Per spec 04_COMPONENTS.md: L2 Executor must use Claude Code CLI for task execution.
 * Per spec 10_REPL_UX.md Section 10: Non-interactive mode guarantees (Property 34-36).
 *
 * This is NOT a simulation - it actually spawns the `claude` CLI process.
 *
 * Timeout Design (v3 - AC B: Abolish silence=timeout):
 * - SOFT_TIMEOUT: Warning only, continue execution
 * - HARD_TIMEOUT: ABOLISHED - silence alone does NOT terminate
 * - OVERALL_TIMEOUT: Total execution time limit (safety net, optional)
 * - Process state monitoring: Check if process is still alive
 *
 * Key principle: "silence=timeout" is ABOLISHED.
 * Process is only terminated when:
 * 1. Interactive prompt detected (Property 34-36)
 * 2. Overall timeout exceeded (safety net)
 * 3. Process dies naturally
 */
import type { BlockedReason, TerminatedBy } from '../models/enums';
/**
 * Executor configuration
 */
export interface ExecutorConfig {
    projectPath: string;
    timeout: number;
    cliPath?: string;
    softTimeoutMs?: number;
    silenceLogIntervalMs?: number;
    /** Show verbose executor logs (default: false) */
    verbose?: boolean;
    /** Disable overall timeout (for very long tasks) */
    disableOverallTimeout?: boolean;
    /**
     * Progress-aware timeout: reset overall timeout on output activity.
     * When true, output (stdout/stderr) extends the timeout window.
     * Default: false (preserve v3 "overall safety net" semantics).
     */
    progressAwareTimeout?: boolean;
}
/**
 * Task to execute
 *
 * Per spec 10_REPL_UX.md L117-118: Model selection is REPL-local.
 * The selectedModel is passed to Claude Code CLI via --model flag.
 * This is a "thin wrapper" - no prompt modification, no result interpretation.
 */
export interface ExecutorTask {
    id: string;
    prompt: string;
    workingDir: string;
    /** Model to use (from .claude/repl.json). Undefined means use CLI default. */
    selectedModel?: string;
    /**
     * Task type for completion judgment.
     * READ_INFO tasks don't require file changes - response output becomes evidence.
     */
    taskType?: 'READ_INFO' | 'IMPLEMENTATION' | 'REPORT' | string;
}
/**
 * Verified file information
 */
export interface VerifiedFile {
    path: string;
    exists: boolean;
    size?: number;
    content_preview?: string;
}
/**
 * Execution result
 * Per spec 10_REPL_UX.md Section 10: Includes blocking detection info (Property 34-36)
 */
export interface ExecutorResult {
    executed: boolean;
    output: string;
    error?: string;
    files_modified: string[];
    duration_ms: number;
    status: 'COMPLETE' | 'INCOMPLETE' | 'NO_EVIDENCE' | 'ERROR' | 'BLOCKED';
    /** cwd used for execution - must be projectPath */
    cwd: string;
    /** Files that were verified to exist after execution */
    verified_files: VerifiedFile[];
    /** Files that were claimed but don't exist (fail-closed detection) */
    unverified_files: string[];
    /** Executor blocked in non-interactive mode (Property 34-36) */
    executor_blocked?: boolean;
    /** Blocking reason when executor_blocked is true */
    blocked_reason?: BlockedReason;
    /** Time until blocking was detected (ms) */
    timeout_ms?: number;
    /** How the executor was terminated */
    terminated_by?: TerminatedBy;
}
/**
 * Auth check result
 * Per spec/15_API_KEY_ENV_SANITIZE.md: Check login status at startup
 */
export interface AuthCheckResult {
    available: boolean;
    loggedIn: boolean;
    error?: string;
}
/**
 * Executor interface for dependency injection
 *
 * Allows substituting the real ClaudeCodeExecutor with mocks for testing.
 */
export interface IExecutor {
    execute(task: ExecutorTask): Promise<ExecutorResult>;
    isClaudeCodeAvailable(): Promise<boolean>;
    checkAuthStatus(): Promise<AuthCheckResult>;
}
/**
 * Build sanitized environment from ALLOWLIST
 * Per spec/15_API_KEY_ENV_SANITIZE.md: Never pass process.env directly.
 *
 * @returns Record containing only ALLOWLIST variables
 */
export declare function buildSanitizedEnv(): Record<string, string>;
/**
 * Claude Code Executor class
 *
 * Spawns Claude Code CLI to execute natural language tasks.
 * Fail-closed: If CLI is not available, returns error status.
 * Property 34-36: Detects blocking in non-interactive mode and terminates.
 *
 * v2 Improvements:
 * - Two-stage timeout (soft/hard)
 * - Process state monitoring
 * - Extended interactive prompt detection
 * - Better error recovery
 */
export declare class ClaudeCodeExecutor implements IExecutor {
    private readonly config;
    private readonly cliPath;
    private readonly softTimeoutMs;
    private readonly silenceLogIntervalMs;
    private readonly verbose;
    private readonly disableOverallTimeout;
    private readonly progressAwareTimeout;
    constructor(config: ExecutorConfig);
    /**
     * Log message if verbose mode is enabled
     */
    private log;
    /**
     * Check if Claude Code CLI is available
     *
     * @returns true if CLI is available, false otherwise
     */
    isClaudeCodeAvailable(): Promise<boolean>;
    /**
     * Check Claude Code CLI auth status
     * Per spec/15_API_KEY_ENV_SANITIZE.md: Runner must check login status at startup
     *
     * This method checks:
     * 1. CLI exists (version check)
     * 2. CLI is logged in (can run minimal prompt without auth error)
     *
     * @returns AuthCheckResult with availability and login status
     */
    checkAuthStatus(): Promise<AuthCheckResult>;
    /**
     * Execute a task via Claude Code CLI
     *
     * Fail-closed behavior:
     * - If CLI not available → error status
     * - If no files modified → INCOMPLETE status
     * - If timeout → error status
     *
     * v2 Timeout behavior:
     * - Soft timeout: Warning only, continue execution
     * - Hard timeout: No output for extended period, terminate
     * - Overall timeout: Total execution time limit
     *
     * @param task - Task to execute
     * @returns Execution result
     */
    execute(task: ExecutorTask): Promise<ExecutorResult>;
    /**
     * List all files in a directory (recursively)
     */
    private listFiles;
    /**
     * Detect files that were modified or created
     */
    private detectModifiedFiles;
}
//# sourceMappingURL=claude-code-executor.d.ts.map