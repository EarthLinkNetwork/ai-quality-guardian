/**
 * REPL Interface for PM Orchestrator Runner
 * Provides an interactive CLI experience with slash commands
 *
 * Supports two execution modes (per spec 10_REPL_UX.md):
 * - Interactive mode: TTY connected, readline with prompt
 * - Non-interactive mode: stdin script / heredoc / pipe
 *
 * Non-interactive mode guarantees:
 * - Sequential Processing: Each command completes before next starts
 * - Output Flush: All stdout is flushed before exit
 * - Deterministic Exit Code: 0=COMPLETE, 1=ERROR, 2=INCOMPLETE
 *
 * Project Mode (per spec 10_REPL_UX.md, Property 32, 33):
 * - temp: Use temporary directory (default, cleaned up on exit)
 * - fixed: Use specified directory (persists after exit)
 */
import { EventEmitter } from 'events';
import { RunnerCore } from '../core/runner-core';
import { ExecutorSupervisor } from '../supervisor/executor-supervisor';
/**
 * Project Mode - per spec 10_REPL_UX.md
 * Controls how verification_root is determined
 * - temp: Use temporary directory (default)
 * - fixed: Use specified --project-root directory
 */
export type ProjectMode = 'temp' | 'fixed';
/**
 * Verified File record - per spec 06_CORRECTNESS_PROPERTIES.md Property 33
 * Records file verification result with traceability information
 */
export interface VerifiedFile {
    /** Path relative to verification_root */
    path: string;
    /** Whether the file exists */
    exists: boolean;
    /** ISO 8601 timestamp when detection occurred */
    detected_at: string;
    /** Method used to detect the file */
    detection_method: 'diff' | 'executor_claim';
}
/**
 * Task Log structure with verification info - per spec 05_DATA_MODELS.md
 */
export interface TaskLog {
    task_id: string;
    description: string;
    verification_root: string;
    verified_files?: VerifiedFile[];
    created_at: string;
}
/**
 * REPL configuration - extended for Property 32, 33
 */
export interface REPLConfig {
    projectPath?: string;
    evidenceDir?: string;
    prompt?: string;
    authMode?: 'claude-code' | 'api-key';
    /** Timeout for Claude Code execution in milliseconds (default: 120000) */
    timeout?: number;
    /** Force non-interactive mode (for testing) */
    forceNonInteractive?: boolean;
    /**
     * Project mode - per spec 10_REPL_UX.md
     * - 'temp': Use temporary directory for verification_root (default)
     * - 'fixed': Use projectRoot as verification_root
     */
    projectMode?: ProjectMode;
    /**
     * Project root for fixed mode - per spec 10_REPL_UX.md
     * Required when projectMode is 'fixed'
     * Must be an existing directory
     */
    projectRoot?: string;
    /**
     * Print project path on startup - per spec 10_REPL_UX.md
     * Outputs PROJECT_PATH=<path> for machine-readable parsing
     */
    printProjectPath?: boolean;
}
/**
 * REPL Execution Mode - per spec 05_DATA_MODELS.md
 * Detected at startup, determines I/O behavior
 */
export type ReplExecutionMode = 'interactive' | 'non_interactive';
/**
 * Exit codes for non-interactive mode - per spec 10_REPL_UX.md
 * These are deterministic based on session state
 */
export declare const EXIT_CODES: {
    readonly COMPLETE: 0;
    readonly ERROR: 1;
    readonly INCOMPLETE: 2;
};
/**
 * Command result - per spec 10_REPL_UX.md L66
 * All commands must return a status (fail-closed principle)
 */
export interface CommandResult {
    success: boolean;
    message?: string;
    error?: {
        code: string;
        message: string;
    };
}
/**
 * Task log status - per spec 05_DATA_MODELS.md
 * Terminal states: complete | incomplete | error
 */
export type TaskLogStatus = 'queued' | 'running' | 'complete' | 'incomplete' | 'error';
/**
 * REPL session state - per spec 05_DATA_MODELS.md
 * Extended with current_task_id / last_task_id tracking
 */
interface REPLSession {
    sessionId: string | null;
    projectPath: string;
    runner: RunnerCore | null;
    supervisor: ExecutorSupervisor | null;
    status: 'idle' | 'running' | 'paused';
    /** Currently running task ID (null when no task or terminal state) */
    current_task_id: string | null;
    /** Last completed/failed task ID (preserved across tasks) */
    last_task_id: string | null;
}
/**
 * REPL Interface class
 */
export declare class REPLInterface extends EventEmitter {
    private readonly config;
    private rl;
    private session;
    private running;
    private initOnlyMode;
    private inputQueue;
    private isProcessingInput;
    private multiLineBuffer;
    private executionMode;
    private exitCode;
    private hasError;
    private hasIncompleteTasks;
    private sessionCompleted;
    private projectMode;
    private verificationRoot;
    private tempVerificationRoot;
    private initCommand;
    private modelCommand;
    private sessionCommands;
    private statusCommands;
    private providerCommand;
    private modelsCommand;
    private keysCommand;
    private logsCommand;
    constructor(config?: REPLConfig);
    /**
     * Get project mode - per spec 10_REPL_UX.md
     * @returns Current project mode ('temp' or 'fixed')
     */
    getProjectMode(): ProjectMode;
    /**
     * Get verification root - per spec Property 32, 33
     * @returns Absolute path to verification root directory
     */
    getVerificationRoot(): string;
    /**
     * Initialize for use - called by start() or manually for testing
     * Handles project path setup and PROJECT_PATH output
     */
    initialize(): Promise<void>;
    /**
     * Initialize temporary project root - per spec Property 32
     * Creates a temporary directory for verification_root in temp mode
     * Also creates minimal .claude structure to avoid init-only mode
     */
    initializeTempProjectRoot(): Promise<void>;
    /**
     * Verify files and return verification records - per spec Property 33
     * @param absolutePaths - Array of absolute file paths to verify
     * @returns Array of VerifiedFile records with relative paths
     */
    verifyFiles(absolutePaths: string[]): VerifiedFile[];
    /**
     * Create a TaskLog with verification info - per spec Property 33
     * @param taskId - Task identifier
     * @param description - Task description
     * @returns TaskLog with verification_root populated
     */
    createTaskLog(taskId: string, description: string): TaskLog;
    /**
     * Cleanup resources - handles temp directory cleanup
     * Per spec Property 32: temp mode directories may be cleaned up
     */
    cleanup(): Promise<void>;
    /**
     * Check API key status and show warning if not configured
     * API keys are stored in global config file (~/.pm-orchestrator-runner/config.json)
     */
    private checkApiKeyStatus;
    /**
     * Start the REPL
     * Per spec 10_REPL_UX.md L45: validate project structure on startup
     *
     * If .claude is missing, enter init-only mode instead of throwing.
     * In init-only mode, only /help, /init, /exit are available.
     *
     * API Key Check:
     * - In api-key mode, check for API keys in global config
     * - Show warning if not configured, with instructions to set up
     */
    start(): Promise<void>;
    /**
     * Process input line
     */
    private processInput;
    /**
     * Enqueue input for sequential processing
     * This prevents race conditions when piped input arrives faster than processing
     *
     * Multi-line input support (for voice input like SuperWhisper):
     * - Non-empty lines are accumulated in multiLineBuffer
     * - Empty line triggers submission of accumulated content
     * - This allows long messages with newlines to be sent together
     */
    private enqueueInput;
    /**
     * Process queued inputs sequentially
     * Ensures each input completes before the next one starts
     * Per spec 10_REPL_UX.md: Sequential Processing Guarantee
     */
    private processQueue;
    /**
     * Process slash command
     * Per spec 10_REPL_UX.md L66: All commands must return a status (fail-closed)
     *
     * In init-only mode, only /help, /init, /exit are allowed.
     * Other commands return ERROR with instruction to run /init first.
     */
    processCommand(input: string): Promise<CommandResult>;
    /**
     * Check if input is a bare "exit" typo (should use /exit)
     * Per spec 10_REPL_UX.md: Exit Typo Safety
     * Pattern: ^exit\s*$ (case-insensitive, trimmed)
     */
    private isExitTypo;
    /**
     * Process natural language input
     * Per spec 10_REPL_UX.md L117-118: Model selection is REPL-local
     * Model is read from .claude/repl.json and passed to executor via runner
     *
     * Auto-start: In non-interactive mode, automatically start a session if none exists
     * This improves CLI usability for piped input and scripting
     *
     * Exit Typo Safety (per spec 10_REPL_UX.md):
     * - Detects bare "exit" input (without slash)
     * - Shows error and suggests /exit
     * - Never passes "exit" to Claude Code
     */
    private processNaturalLanguage;
    /**
     * Handle clarification needed - prompt user interactively
     * Returns true if clarification was requested (and will be processed separately)
     */
    private handleClarificationNeeded;
    /**
     * Print welcome message with clear auth status
     */
    private printWelcome;
    /**
     * Print help
     */
    private printHelp;
    /**
     * Handle /init command
     */
    private handleInit;
    /**
     * Handle /model command
     * Per spec 10_REPL_UX.md L113-143:
     * - /model displays current model or "UNSET"
     * - /model <name> sets model and generates Evidence
     * - .claude/ missing -> E101 ERROR
     * - JSON parse error -> E105 ERROR
     */
    private handleModel;
    /**
     * Handle /provider command
     * Per spec 10_REPL_UX.md Section 2.1
     */
    private handleProvider;
    /**
     * Handle /models command
     * Per spec 10_REPL_UX.md Section 2.2
     */
    private handleModels;
    /**
     * Handle /keys command
     * Per spec 10_REPL_UX.md Section 2.3
     *
     * /keys              - Show status of all API keys
     * /keys set <p> <k>  - Set API key for provider
     * /keys <provider>   - Check specific provider
     */
    private handleKeys;
    /**
     * Handle /logs command
     * Per spec 10_REPL_UX.md Section 2.4
     */
    private handleLogs;
    /**
     * Handle /tasks command
     */
    private handleTasks;
    /**
     * Handle /status command
     */
    private handleStatus;
    /**
     * Handle /start command
     * Per spec Property 32, 33: Use verification_root for file operations in temp mode
     */
    private handleStart;
    /**
     * Handle /continue command
     */
    private handleContinue;
    /**
     * Handle /approve command
     */
    private handleApprove;
    /**
     * Handle /exit command
     * Per spec 10_REPL_UX.md: Ensure clean exit with flushed output
     *
     * Guarantees:
     * - Session state is persisted before exit
     * - All output is flushed before readline closes
     * - Double-completion is prevented via sessionCompleted flag
     */
    private handleExit;
    /**
     * Map OverallStatus to TaskLogStatus
     * Per spec 05_DATA_MODELS.md: Terminal states are complete/incomplete/error
     */
    private mapToTaskLogStatus;
    /**
     * Check if status is terminal
     * Per spec 05_DATA_MODELS.md: Terminal states are complete/incomplete/error
     */
    private isTerminalStatus;
    /**
     * Print immediate summary block
     * Per spec 10_REPL_UX.md: Immediate Summary Output
     *
     * COMPLETE (4 lines fixed):
     *   RESULT: COMPLETE / TASK / NEXT: (none) / HINT
     *
     * INCOMPLETE/ERROR (5 lines fixed, WHY required):
     *   RESULT / TASK / NEXT: /logs <id> / WHY / HINT
     */
    private printImmediateSummary;
    /**
     * Print execution result
     * Per spec 10_REPL_UX.md: Error details must be visible for fail-closed debugging
     * Also prints Immediate Summary for terminal states (per Property 39)
     */
    private printExecutionResult;
    /**
     * Print message with flush guarantee for non-interactive mode
     * Per spec 10_REPL_UX.md: Output Flush Guarantee
     */
    private print;
    /**
     * Flush stdout - ensures all output is written before continuing
     * Critical for non-interactive mode where process may exit immediately after
     */
    private flushStdout;
    /**
     * Print error
     */
    private printError;
    /**
     * Validate project structure - per spec 10_REPL_UX.md L45
     * "REPL の起動時点で validate 相当の検証を行い、必須構造がなければ即 ERROR とする。"
     *
     * @returns Validation result with valid flag and errors array
     */
    validateProjectStructure(): Promise<{
        valid: boolean;
        errors: string[];
    }>;
    /**
     * Check if REPL is in init-only mode
     * Init-only mode is active when .claude directory is missing
     * In this mode, only /help, /init, /exit are allowed
     *
     * @returns true if in init-only mode (rechecks file system)
     */
    isInitOnlyMode(): Promise<boolean>;
    /**
     * Tab completion for slash commands
     * Per spec 10_REPL_UX.md: Tab completion support
     *
     * @param line - Current input line
     * @returns Tuple of [completions, original line]
     */
    private completer;
    /**
     * Detect execution mode based on TTY, environment, or config
     * Per spec 10_REPL_UX.md: Non-interactive mode detection
     */
    private detectExecutionMode;
    /**
     * Check if running in non-interactive mode
     */
    isNonInteractiveMode(): boolean;
    /**
     * Get the current execution mode
     */
    getExecutionMode(): ReplExecutionMode;
    /**
     * Set exit code based on current state
     * Per spec 10_REPL_UX.md: Deterministic exit codes
     */
    private updateExitCode;
    /**
     * Get the exit code (for non-interactive mode)
     */
    getExitCode(): number;
    /**
     * Get session state (for testing)
     */
    getSessionState(): REPLSession;
    /**
     * Check if running (for testing)
     */
    isRunning(): boolean;
}
export {};
//# sourceMappingURL=repl-interface.d.ts.map