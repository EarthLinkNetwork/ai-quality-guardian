/**
 * Web Background Commands
 * Per spec/19_WEB_UI.md lines 361-432
 *
 * Provides:
 * - PidFileManager: PID file read/write/delete operations
 * - WebServerProcess: Background server spawning
 * - WebStopCommand: Stop running server via PID
 */
/**
 * Exit codes for web-stop command
 * Per spec/19_WEB_UI.md lines 420-426
 */
export declare enum WebStopExitCode {
    /** Normal stop - server stopped successfully */
    SUCCESS = 0,
    /** PID file not found - server not running */
    PID_FILE_NOT_FOUND = 1,
    /** Force killed - SIGKILL was required after SIGTERM timeout */
    FORCE_KILLED = 2
}
/**
 * Result of web-stop command execution
 */
export interface WebStopResult {
    exitCode: WebStopExitCode;
    message: string;
    pid?: number;
}
/**
 * Options for WebStopCommand
 */
export interface WebStopOptions {
    /** Timeout in ms to wait for graceful shutdown (default: 5000) */
    gracefulTimeoutMs?: number;
}
/**
 * Parsed background arguments
 */
export interface BackgroundArgs {
    background: boolean;
    port?: number;
    namespace?: string;
}
/**
 * Web server process configuration
 */
export interface WebServerProcessConfig {
    projectRoot: string;
    namespace: string;
    port: number;
}
/**
 * Validation result for background prerequisites
 */
export interface ValidationResult {
    valid: boolean;
    error?: string;
}
/**
 * PidFileManager - Manages PID files for background web servers
 * Per spec/19_WEB_UI.md lines 380-388
 *
 * PID file path: .claude/state/{namespace}/web-server.pid
 * For default namespace: .claude/web-server.pid
 */
export declare class PidFileManager {
    private readonly projectRoot;
    constructor(projectRoot: string);
    /**
     * Get PID file path for namespace
     * Per spec/19_WEB_UI.md lines 382-384
     */
    getPidFilePath(namespace: string): string;
    /**
     * Get log file path for namespace
     * Per spec/19_WEB_UI.md lines 392-394
     */
    getLogFilePath(namespace: string): string;
    /**
     * Get state directory for namespace
     */
    getStateDir(namespace: string): string;
    /**
     * Write PID to file
     * Creates parent directories if needed
     */
    writePid(namespace: string, pid: number): Promise<void>;
    /**
     * Read PID from file
     * Returns null if file doesn't exist or contains invalid data
     */
    readPid(namespace: string): Promise<number | null>;
    /**
     * Delete PID file
     * Does not throw if file doesn't exist
     */
    deletePid(namespace: string): Promise<void>;
    /**
     * Check if a process is running
     * Uses kill(pid, 0) to check without sending signal
     */
    isProcessRunning(pid: number): boolean;
    /**
     * Send signal to process
     */
    sendSignal(pid: number, signal: NodeJS.Signals): boolean;
}
/**
 * WebStopCommand - Stops a background web server
 * Per spec/19_WEB_UI.md lines 400-432
 *
 * Flow:
 * 1. Read PID file
 * 2. Send SIGTERM (graceful shutdown)
 * 3. Wait up to 5 seconds
 * 4. If still running, send SIGKILL (force)
 * 5. Delete PID file
 */
export declare class WebStopCommand {
    private readonly pidManager;
    private readonly gracefulTimeoutMs;
    constructor(pidManager: PidFileManager, options?: WebStopOptions);
    /**
     * Execute web-stop command
     * Per spec/19_WEB_UI.md lines 412-418
     */
    execute(namespace: string): Promise<WebStopResult>;
    /**
     * Wait for process to stop
     * Returns true if process stopped, false if timeout
     */
    private waitForStop;
}
/**
 * WebServerProcess - Manages background web server spawning
 * Per spec/19_WEB_UI.md lines 361-398
 */
export declare class WebServerProcess {
    private readonly config;
    private readonly pidManager;
    private childProcess;
    constructor(config: WebServerProcessConfig);
    /**
     * Parse --background and related arguments
     */
    static parseBackgroundArgs(args: string[]): BackgroundArgs;
    /**
     * Validate prerequisites for background mode
     * Creates state directory if needed
     */
    validateBackgroundPrerequisites(): Promise<ValidationResult>;
    /**
     * Spawn web server in background
     * Per spec/19_WEB_UI.md lines 373-378
     */
    spawnBackground(): Promise<{
        success: boolean;
        pid?: number;
        error?: string;
    }>;
    /**
     * Get PID manager for external use
     */
    getPidManager(): PidFileManager;
}
//# sourceMappingURL=background.d.ts.map